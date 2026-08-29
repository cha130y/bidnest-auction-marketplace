import {
  BadRequestException,
  ConflictException,
  Injectable
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { calculateLineTotal } from '../cart/utils/calculate-line-total.util';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from '../payment/payment.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CheckoutDto } from './dtos/checkout.dto';
import {
  CheckoutIssue,
  collectCheckoutIssues,
  missingCartLineIssue,
  stockLostIssue
} from './utils/checkout-issue.util';

/**
 * CART-004 — what kind of refusal this is, for a screen to act on.
 *
 * The `message` beside it stays the sentence it always was, so the API docs
 * and the Postman suite still read true; this is the part a UI can branch on
 * without matching English prose that any rewording would break.
 *
 * `ITEMS_UNAVAILABLE` and `STOCK_LOST_AFTER_CHARGE` are the same underlying
 * fact — something is not on the shelf — split by the only difference the
 * buyer cares about: whether their money moved before we found out.
 */
export const CheckoutErrorCode = {
  ITEMS_UNAVAILABLE: 'ITEMS_UNAVAILABLE',
  STOCK_LOST_AFTER_CHARGE: 'STOCK_LOST_AFTER_CHARGE',
  CART_EMPTY: 'CART_EMPTY',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  AUCTION_UNPAYABLE: 'AUCTION_UNPAYABLE',
  AUCTION_ALREADY_PAID: 'AUCTION_ALREADY_PAID'
} as const;

export type CheckoutErrorCode =
  (typeof CheckoutErrorCode)[keyof typeof CheckoutErrorCode];

/**
 * One thing being bought, priced by this server.
 *
 * `productId` and `auctionId` are exactly-one-of, mirroring `OrderItem`. A
 * cart line has a product and a `cartItemId` to clear afterwards; an auction
 * win has neither, which is why both are nullable here rather than the type
 * being split in two — everything downstream of pricing (grouping by seller,
 * charging, writing the order, notifying) treats them identically, and only
 * the two steps that are genuinely about stock and carts have to look.
 */
type PricedLine = {
  /** The cart line to clear once paid, or null for an auction win. */
  cartItemId: string | null;
  productId: string | null;
  auctionId: string | null;
  title: string;
  sellerId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payment: MockPaymentProvider,
    private readonly realtime: RealtimeService,
    private readonly chat: ChatService
  ) {}

  async checkout(buyerId: string, dto: CheckoutDto) {
    if (dto.auctionId && dto.cartItemIds) {
      throw new BadRequestException(
        'Send either auctionId or cartItemIds, not both'
      );
    }

    // The only fork in this method. Everything past it — the charge, the
    // payment row, the order, the address snapshot, the notifications — is one
    // path, because paying for a won lot and paying for a basket differ in
    // what is being bought and in nothing else.
    const lines = dto.auctionId
      ? await this.priceAuction(buyerId, dto.auctionId)
      : await this.priceCart(buyerId, dto.cartItemIds);

    const grandTotal = lines.reduce(
      (sum, line) => sum.plus(line.subtotal),
      new Prisma.Decimal(0)
    );

    // CART-004 — one provider call and one payment_transactions row per
    // checkout session, never one per order.
    const checkoutSessionId = randomUUID();
    const charge = this.payment.charge({
      checkoutSessionId,
      amount: grandTotal.toFixed(2),
      method: dto.paymentMethod
    });

    // Committed on its own, before the orders: a charge that happened must stay
    // on record even if the order transaction later rolls back, so the two
    // outcomes can be reconciled. Both branches are persisted the same way.
    const payment = await this.prisma.paymentTransaction.create({
      data: {
        checkoutSessionId,
        status: charge.status,
        method: dto.paymentMethod
      },
      select: { id: true }
    });

    if (charge.status === 'FAILED') {
      // No orders, and the cart is left exactly as it was. The only refusal in
      // this file that a plain retry can actually get past.
      throw new BadRequestException({
        message: 'Payment failed',
        code: CheckoutErrorCode.PAYMENT_DECLINED,
        checkoutSessionId,
        reason: charge.failureReason ?? 'Unknown'
      });
    }

    const result = await this.runOrderTransaction(
      buyerId,
      dto,
      lines,
      payment.id,
      checkoutSessionId
    );

    // Emitted after commit so no one is notified about a rolled-back order
    for (const notification of result.notifications) {
      this.realtime.emitNotificationCreated(notification.userId, notification);
    }

    // CHAT-004 — same reason: a seller's auto-reply should never appear to
    // have been sent for an order that did not, in the end, go through.
    //
    // Skipped for an auction win: the auto-reply opens a thread about a
    // product, and a lot is not one. Nobody is left without a way to reach the
    // seller either — bidding on an auction already gives it a conversation.
    for (const order of result.orders) {
      if (order.productId === null) continue;

      void this.chat.sendPurchaseAutoReply(
        order.sellerId,
        buyerId,
        order.productId
      );
    }

    return {
      checkoutSessionId,
      paymentStatus: 'SUCCEEDED',
      paymentReference: charge.reference,
      total: grandTotal.toFixed(2),
      orders: result.orders
    };
  }

  /**
   * Writes the orders, and turns the one database error that is really a
   * conflict into one.
   *
   * `order_items.auction_id` is unique, so two payments racing for the same
   * lot end with the loser hitting P2002 here. Left alone that surfaces as a
   * 500 — after the charge has already been committed, which is the worst
   * possible moment to say "something went wrong" and nothing else. The
   * ordinary double-click never reaches this far: `priceAuction` refuses it
   * before any money moves. This is only for the genuine race, and it answers
   * it the way `decrementStock` already answers its own — with the session id
   * support needs to reconcile a charge against no order.
   */
  private async runOrderTransaction(
    buyerId: string,
    dto: CheckoutDto,
    lines: PricedLine[],
    paymentTransactionId: string,
    checkoutSessionId: string
  ) {
    try {
      return await this.writeOrders(
        buyerId,
        dto,
        lines,
        paymentTransactionId,
        checkoutSessionId
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message:
            'That auction was paid for while this payment was going through',
          code: CheckoutErrorCode.AUCTION_ALREADY_PAID,
          checkoutSessionId
        });
      }

      throw error;
    }
  }

  private async writeOrders(
    buyerId: string,
    dto: CheckoutDto,
    lines: PricedLine[],
    paymentTransactionId: string,
    checkoutSessionId: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const bySeller = this.groupBySeller(lines);
      const orders: {
        id: string;
        sellerId: string;
        subtotal: string;
        productId: string | null;
      }[] = [];

      for (const [sellerId, sellerLines] of bySeller) {
        const subtotal = sellerLines.reduce(
          (sum, line) => sum.plus(line.subtotal),
          new Prisma.Decimal(0)
        );

        const order = await tx.order.create({
          data: {
            checkoutSessionId,
            sellerId,
            buyerId,
            paymentTransactionId,
            subtotal,
            status: 'PAID',
            items: {
              create: sellerLines.map((line) => ({
                productId: line.productId,
                auctionId: line.auctionId,
                quantity: line.quantity,
                unitPrice: line.unitPrice
              }))
            },
            // CART-005 — address snapshot is frozen per order at payment time
            address: { create: { ...dto.shippingAddress } },
            shipment: {
              create: {
                status: 'PROCESSING',
                events: { create: { eventType: 'PROCESSING' } }
              }
            }
          },
          select: { id: true }
        });

        orders.push({
          id: order.id,
          sellerId,
          subtotal: subtotal.toFixed(2),
          // CHAT-004 — the auto-reply needs *a* listing to attach its thread
          // to; the first line in the order is as good a choice as any when
          // a seller sold several products in the same checkout.
          //
          // Null for an auction win: `sendPurchaseAutoReply` opens a thread
          // about a product, and a lot is not one. A won auction already has
          // its own conversation from the bidding, so there is no silence to
          // fill here.
          productId: sellerLines[0].productId
        });
      }

      // Both of these are about products in a cart, and an auction win is
      // neither — it has no stock to draw down and no cart line to clear.
      // Filtering rather than branching keeps the mixed case correct for free,
      // if a later change ever lets one checkout carry both.
      await this.decrementStock(tx, lines, checkoutSessionId);

      // Only the lines that were actually priced and ordered are cleared —
      // anything added to the cart mid-checkout stays put.
      const cartItemIds = lines
        .map((line) => line.cartItemId)
        .filter((id): id is string => id !== null);

      if (cartItemIds.length > 0) {
        await tx.cartItem.deleteMany({ where: { id: { in: cartItemIds } } });
      }

      const notifications = await this.createOrderPlacedNotifications(
        tx,
        buyerId,
        orders
      );

      return { orders, notifications };
    });
  }

  /**
   * Reads the cart and prices every line against the seller's current price.
   * Nothing here is trusted from the client.
   */
  private async priceCart(
    buyerId: string,
    cartItemIds?: string[]
  ): Promise<PricedLine[]> {
    // The buyer's own cart is always part of the filter, so an id belonging to
    // somebody else's cart matches nothing here rather than being fetched and
    // then rejected — there is no version of this that reads another person's
    // line, not even to refuse it.
    const selected = cartItemIds ? [...new Set(cartItemIds)] : undefined;

    const items = await this.prisma.cartItem.findMany({
      where: {
        cart: { userId: buyerId },
        ...(selected ? { id: { in: selected } } : {})
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sellerId: true,
            price: true,
            stockQty: true,
            status: true,
            quantityDiscountMinQty: true,
            quantityDiscountPercent: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    if (items.length === 0) {
      throw new BadRequestException({
        message: selected
          ? 'No selected item is in your cart'
          : 'Cart is empty',
        code: CheckoutErrorCode.CART_EMPTY
      });
    }

    // A line that was removed, or bought in another tab, between selecting and
    // paying. Charging for what is left would be charging for something other
    // than what the buyer confirmed, so this refuses instead and the screen
    // re-reads the cart.
    if (selected && items.length !== selected.length) {
      const found = new Set(items.map((item) => item.id));
      const missing = selected.filter((id) => !found.has(id)).length;
      throw this.unavailable([missingCartLineIssue(missing)]);
    }

    // Every unbuyable line, not the first one. A buyer told about one dead
    // line fixes it, pays again, and is refused by the next — the cart screen
    // shows all of them at once and this now agrees with it.
    const issues = collectCheckoutIssues(buyerId, items);
    if (issues.length > 0) throw this.unavailable(issues);

    return items.map(({ id: cartItemId, product, quantity }) => {
      const line = calculateLineTotal(product.price, quantity, {
        minQty: product.quantityDiscountMinQty,
        percent: product.quantityDiscountPercent
      });

      return {
        cartItemId,
        productId: product.id,
        auctionId: null,
        title: product.title,
        sellerId: product.sellerId,
        quantity,
        unitPrice: line.effectiveUnitPrice,
        subtotal: line.subtotal
      };
    });
  }

  /**
   * Prices a won auction. The counterpart to `priceCart`, and trusts the
   * client exactly as little.
   *
   * The amount is the lot's own `soldPrice`, written by settlement from the
   * highest bid — there is no field on the request that could influence it.
   * The right to pay comes from `winnerUserId`, so somebody else's lot id
   * bought nothing and gives nothing away: the same refusal answers "that is
   * not yours" and "that does not exist".
   *
   * One line, quantity one. A lot is a single thing, so there is no stock to
   * check and no quantity discount to apply.
   */
  private async priceAuction(
    buyerId: string,
    auctionId: string
  ): Promise<PricedLine[]> {
    const auction = await this.prisma.auction.findFirst({
      where: { id: auctionId, deletedAt: null },
      select: {
        id: true,
        title: true,
        sellerId: true,
        status: true,
        winnerUserId: true,
        soldPrice: true,
        orderItems: { select: { id: true }, take: 1 }
      }
    });

    // Deliberately the same message for "no such auction" and "not your win".
    // A distinct 404 would let anyone holding an id learn whether it exists
    // and whether it sold.
    if (!auction || auction.winnerUserId !== buyerId) {
      throw new BadRequestException({
        message: 'No auction of yours is awaiting payment',
        code: CheckoutErrorCode.AUCTION_UNPAYABLE
      });
    }

    if (auction.status !== 'SOLD' || auction.soldPrice === null) {
      throw new BadRequestException({
        message: `"${auction.title}" did not end in a sale`,
        code: CheckoutErrorCode.AUCTION_UNPAYABLE
      });
    }

    // The unique index on `order_items.auction_id` is the real guarantee — two
    // simultaneous payments end with one of them failing there. This is the
    // readable refusal for the ordinary case of somebody opening the checkout
    // link a second time, and it happens before any money is taken.
    if (auction.orderItems.length > 0) {
      throw new ConflictException({
        message: `"${auction.title}" has already been paid for`,
        code: CheckoutErrorCode.AUCTION_ALREADY_PAID
      });
    }

    return [
      {
        cartItemId: null,
        productId: null,
        auctionId: auction.id,
        title: auction.title,
        sellerId: auction.sellerId,
        quantity: 1,
        unitPrice: auction.soldPrice,
        subtotal: auction.soldPrice
      }
    ];
  }

  /**
   * Nothing was charged and nothing was written — the cart is exactly as the
   * buyer left it, and the fix is on the cart screen rather than here.
   *
   * `message` is the first issue's own sentence rather than a summary, so a
   * caller that only reads `message` — the API docs, the Postman suite, an
   * older client — sees the same string this route has always answered with.
   */
  private unavailable(issues: CheckoutIssue[]) {
    return new BadRequestException({
      message: issues[0].message,
      code: CheckoutErrorCode.ITEMS_UNAVAILABLE,
      issues
    });
  }

  private groupBySeller(lines: PricedLine[]): Map<string, PricedLine[]> {
    const bySeller = new Map<string, PricedLine[]>();

    for (const line of lines) {
      const existing = bySeller.get(line.sellerId);
      if (existing) existing.push(line);
      else bySeller.set(line.sellerId, [line]);
    }

    return bySeller;
  }

  /**
   * PROD-005 — the decrement is guarded by `stockQty >= quantity` so two
   * concurrent checkouts cannot oversell: the loser matches zero rows and the
   * whole transaction rolls back.
   */
  private async decrementStock(
    tx: Prisma.TransactionClient,
    allLines: PricedLine[],
    checkoutSessionId: string
  ) {
    // An auction lot has no stock column — there was one of it, and the
    // bidding decided who got it.
    const lines = allLines.filter(
      (line): line is PricedLine & { productId: string } =>
        line.productId !== null
    );

    if (lines.length === 0) return;

    for (const line of lines) {
      const { count } = await tx.product.updateMany({
        where: {
          id: line.productId,
          status: 'ACTIVE',
          stockQty: { gte: line.quantity }
        },
        data: { stockQty: { decrement: line.quantity } }
      });

      if (count !== 1) {
        // The charge is already on record, so hand back the session id the
        // support side needs to reconcile it.
        //
        // Its own code, separate from the refusals above: those all happen
        // before any money moves, and a screen that told this buyer "nothing
        // was charged" would be telling them something false at the one moment
        // it matters most.
        throw new ConflictException({
          message: `"${line.title}" ran out of stock while checking out`,
          code: CheckoutErrorCode.STOCK_LOST_AFTER_CHARGE,
          checkoutSessionId,
          issues: [stockLostIssue(line.productId, line.title, line.quantity)]
        });
      }
    }

    await tx.product.updateMany({
      where: {
        id: { in: lines.map((line) => line.productId) },
        stockQty: 0,
        status: 'ACTIVE'
      },
      data: { status: 'OUT_OF_STOCK' }
    });
  }

  /** NOT-005 — buyer and every seller in the session get an Order Placed row. */
  private async createOrderPlacedNotifications(
    tx: Prisma.TransactionClient,
    buyerId: string,
    orders: { id: string; sellerId: string; subtotal: string }[]
  ) {
    const rows = [
      ...orders.map((order) => ({
        userId: buyerId,
        orderId: order.id,
        type: 'ORDER_PLACED' as const,
        title: 'Order placed',
        message: `Your order ${order.id} has been paid (THB ${order.subtotal}).`
      })),
      ...orders.map((order) => ({
        userId: order.sellerId,
        orderId: order.id,
        type: 'ORDER_PLACED' as const,
        title: 'New order received',
        message: `You received order ${order.id} (THB ${order.subtotal}).`
      }))
    ];

    await tx.notification.createMany({ data: rows });

    return rows;
  }
}
