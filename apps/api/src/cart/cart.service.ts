import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { calculateLineTotal } from './utils/calculate-line-total.util';

const cartItemInclude = {
  product: {
    select: {
      id: true,
      title: true,
      price: true,
      stockQty: true,
      status: true,
      sellerId: true,
      quantityDiscountMinQty: true,
      quantityDiscountPercent: true,
      seller: {
        select: { id: true, profile: { select: { displayName: true } } },
      },
      images: {
        select: { url: true },
        where: { isPrimary: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemRow = Prisma.CartItemGetPayload<{
  include: typeof cartItemInclude;
}>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.findOrCreateCart(userId);
    return this.buildCartView(cart.id);
  }

  async addItem(userId: string, productId: string, quantity: number) {
    const product = await this.findPurchasableProduct(productId, userId);
    const cart = await this.findOrCreateCart(userId);

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
      select: { quantity: true },
    });

    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    this.assertWithinStock(nextQuantity, product.stockQty, product.title);

    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity: nextQuantity },
      update: { quantity: nextQuantity },
    });

    return this.buildCartView(cart.id);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const cart = await this.findOrCreateCart(userId);
    const item = await this.findOwnedCartItem(cart.id, itemId);

    this.assertWithinStock(quantity, item.product.stockQty, item.product.title);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return this.buildCartView(cart.id);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.findOrCreateCart(userId);
    await this.findOwnedCartItem(cart.id, itemId);

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    return this.buildCartView(cart.id);
  }

  private async findOrCreateCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
  }

  private async findOwnedCartItem(cartId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: cartItemInclude,
    });

    if (!item || item.cartId !== cartId) {
      throw new NotFoundException('Cart item not found');
    }

    return item;
  }

  private async findPurchasableProduct(productId: string, buyerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        status: true,
        stockQty: true,
      },
    });

    if (!product || product.status === 'REMOVED') {
      throw new NotFoundException('Product not found');
    }

    // CART-001 — a seller cannot buy their own listing
    if (product.sellerId === buyerId) {
      throw new ForbiddenException(
        'You cannot add your own product to the cart',
      );
    }

    if (product.status !== 'ACTIVE') {
      throw new BadRequestException(
        `"${product.title}" is not available for purchase`,
      );
    }

    return product;
  }

  private assertWithinStock(quantity: number, stockQty: number, title: string) {
    // CART-001 — quantity is capped by live stock; nothing is reserved here,
    // the real decrement happens at checkout (PROD-005).
    if (quantity > stockQty) {
      throw new BadRequestException(
        `Only ${stockQty} unit(s) of "${title}" are in stock`,
      );
    }
  }

  /**
   * CART-002 — the cart stores nothing but product + quantity; every total is
   * recomputed from the seller's current price on each read.
   */
  private async buildCartView(cartId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: cartItemInclude,
      orderBy: { id: 'asc' },
    });

    const lines = items.map((item) => this.buildLine(item));

    const total = lines.reduce(
      (sum, line) => sum.plus(line.subtotal),
      new Prisma.Decimal(0),
    );
    const discountTotal = lines.reduce(
      (sum, line) => sum.plus(line.discountAmount),
      new Prisma.Decimal(0),
    );

    return {
      items: lines,
      // CART-003 — surfaced up front so the buyer knows the checkout will split
      sellerCount: new Set(lines.map((line) => line.seller.id)).size,
      summary: {
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        discountTotal: discountTotal.toFixed(2),
        total: total.toFixed(2),
      },
    };
  }

  private buildLine(item: CartItemRow) {
    const { product } = item;
    const line = calculateLineTotal(product.price, item.quantity, {
      minQty: product.quantityDiscountMinQty,
      percent: product.quantityDiscountPercent,
    });

    return {
      id: item.id,
      quantity: item.quantity,
      product: {
        id: product.id,
        title: product.title,
        status: product.status,
        stockQty: product.stockQty,
        imageUrl: product.images[0]?.url ?? null,
      },
      seller: {
        id: product.seller.id,
        displayName: product.seller.profile?.displayName ?? null,
      },
      unitPrice: line.unitPrice.toFixed(2),
      effectiveUnitPrice: line.effectiveUnitPrice.toFixed(2),
      discountPercent: line.discountPercent?.toFixed(2) ?? null,
      discountAmount: line.discountAmount.toFixed(2),
      subtotal: line.subtotal.toFixed(2),
      // Flags a line the buyer must fix before checkout can succeed
      issue: this.detectIssue(product.status, item.quantity, product.stockQty),
    };
  }

  private detectIssue(
    status: string,
    quantity: number,
    stockQty: number,
  ): string | null {
    if (status !== 'ACTIVE') return 'PRODUCT_UNAVAILABLE';
    if (quantity > stockQty) return 'INSUFFICIENT_STOCK';
    return null;
  }
}
