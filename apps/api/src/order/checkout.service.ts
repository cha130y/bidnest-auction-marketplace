import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { calculateLineTotal } from '../cart/utils/calculate-line-total.util';
import { PrismaService } from '../database/prisma.service';
import { MockPaymentProvider } from '../payment/payment.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CheckoutDto } from './dtos/checkout.dto';

type PricedLine = {
  cartItemId: string;
  productId: string;
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
  ) {}

  async checkout(buyerId: string, dto: CheckoutDto) {
    const lines = await this.priceCart(buyerId);
    const grandTotal = lines.reduce(
      (sum, line) => sum.plus(line.subtotal),
      new Prisma.Decimal(0),
    );

    // CART-004 — one provider call and one payment_transactions row per
    // checkout session, never one per order.
    const checkoutSessionId = randomUUID();
    const charge = this.payment.charge({
      checkoutSessionId,
      amount: grandTotal.toFixed(2),
      method: dto.paymentMethod,
    });

    // Committed on its own, before the orders: a charge that happened must stay
    // on record even if the order transaction later rolls back, so the two
    // outcomes can be reconciled. Both branches are persisted the same way.
    const payment = await this.prisma.paymentTransaction.create({
      data: {
        checkoutSessionId,
        status: charge.status,
        method: dto.paymentMethod,
      },
      select: { id: true },
    });

    if (charge.status === 'FAILED') {
      // No orders, and the cart is left exactly as it was.
      throw new BadRequestException({
        message: 'Payment failed',
        checkoutSessionId,
        reason: charge.failureReason ?? 'Unknown',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const bySeller = this.groupBySeller(lines);
      const orders: { id: string; sellerId: string; subtotal: string }[] = [];

      for (const [sellerId, sellerLines] of bySeller) {
        const subtotal = sellerLines.reduce(
          (sum, line) => sum.plus(line.subtotal),
          new Prisma.Decimal(0),
        );

        const order = await tx.order.create({
          data: {
            checkoutSessionId,
            sellerId,
            buyerId,
            paymentTransactionId: payment.id,
            subtotal,
            status: 'PAID',
            items: {
              create: sellerLines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })),
            },
            // CART-005 — address snapshot is frozen per order at payment time
            address: { create: { ...dto.shippingAddress } },
            shipment: {
              create: {
                status: 'PROCESSING',
                events: { create: { eventType: 'PROCESSING' } },
              },
            },
          },
          select: { id: true },
        });

        orders.push({
          id: order.id,
          sellerId,
          subtotal: subtotal.toFixed(2),
        });
      }

      await this.decrementStock(tx, lines, checkoutSessionId);

      // Only the lines that were actually priced and ordered are cleared —
      // anything added to the cart mid-checkout stays put.
      await tx.cartItem.deleteMany({
        where: { id: { in: lines.map((line) => line.cartItemId) } },
      });

      const notifications = await this.createOrderPlacedNotifications(
        tx,
        buyerId,
        orders,
      );

      return { orders, notifications };
    });

    // Emitted after commit so no one is notified about a rolled-back order
    for (const notification of result.notifications) {
      this.realtime.emitNotificationCreated(notification.userId, notification);
    }

    return {
      checkoutSessionId,
      paymentStatus: 'SUCCEEDED',
      paymentReference: charge.reference,
      total: grandTotal.toFixed(2),
      orders: result.orders,
    };
  }

  /**
   * Reads the cart and prices every line against the seller's current price.
   * Nothing here is trusted from the client.
   */
  private async priceCart(buyerId: string): Promise<PricedLine[]> {
    const items = await this.prisma.cartItem.findMany({
      where: { cart: { userId: buyerId } },
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
            quantityDiscountPercent: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    return items.map(({ id: cartItemId, product, quantity }) => {
      if (product.status !== 'ACTIVE') {
        throw new BadRequestException(
          `"${product.title}" is no longer available`,
        );
      }

      if (product.sellerId === buyerId) {
        throw new BadRequestException(
          `"${product.title}" is your own listing and cannot be purchased`,
        );
      }

      if (quantity > product.stockQty) {
        throw new BadRequestException(
          `Only ${product.stockQty} unit(s) of "${product.title}" are in stock`,
        );
      }

      const line = calculateLineTotal(product.price, quantity, {
        minQty: product.quantityDiscountMinQty,
        percent: product.quantityDiscountPercent,
      });

      return {
        cartItemId,
        productId: product.id,
        title: product.title,
        sellerId: product.sellerId,
        quantity,
        unitPrice: line.effectiveUnitPrice,
        subtotal: line.subtotal,
      };
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
    lines: PricedLine[],
    checkoutSessionId: string,
  ) {
    for (const line of lines) {
      const { count } = await tx.product.updateMany({
        where: {
          id: line.productId,
          status: 'ACTIVE',
          stockQty: { gte: line.quantity },
        },
        data: { stockQty: { decrement: line.quantity } },
      });

      if (count !== 1) {
        // The charge is already on record, so hand back the session id the
        // support side needs to reconcile it.
        throw new ConflictException({
          message: `"${line.title}" ran out of stock while checking out`,
          checkoutSessionId,
        });
      }
    }

    await tx.product.updateMany({
      where: {
        id: { in: lines.map((line) => line.productId) },
        stockQty: 0,
        status: 'ACTIVE',
      },
      data: { status: 'OUT_OF_STOCK' },
    });
  }

  /** NOT-005 — buyer and every seller in the session get an Order Placed row. */
  private async createOrderPlacedNotifications(
    tx: Prisma.TransactionClient,
    buyerId: string,
    orders: { id: string; sellerId: string; subtotal: string }[],
  ) {
    const rows = [
      ...orders.map((order) => ({
        userId: buyerId,
        orderId: order.id,
        type: 'ORDER_PLACED' as const,
        title: 'Order placed',
        message: `Your order ${order.id} has been paid (THB ${order.subtotal}).`,
      })),
      ...orders.map((order) => ({
        userId: order.sellerId,
        orderId: order.id,
        type: 'ORDER_PLACED' as const,
        title: 'New order received',
        message: `You received order ${order.id} (THB ${order.subtotal}).`,
      })),
    ];

    await tx.notification.createMany({ data: rows });

    return rows;
  }
}
