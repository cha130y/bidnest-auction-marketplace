import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { OrderStatus, ShipmentStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;

const orderInclude = {
  items: {
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      product: {
        select: {
          id: true,
          title: true,
          images: {
            select: { url: true },
            where: { isPrimary: true },
            take: 1
          }
        }
      }
    }
  },
  address: true,
  shipment: { select: { status: true, trackingNumber: true, carrier: true } },
  seller: { select: { id: true, profile: { select: { displayName: true } } } },
  buyer: { select: { id: true, profile: { select: { displayName: true } } } }
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/**
 * What a caller may narrow an order list by. An object rather than four
 * positional arguments: the two are both optional and both enums, so a call
 * site that put them the wrong way round would still compile.
 */
export type OrderFilters = {
  status?: OrderStatus;
  shipmentStatus?: ShipmentStatus[];
  page?: number;
  limit?: number;
};

function narrow({
  status,
  shipmentStatus
}: OrderFilters): Prisma.OrderWhereInput {
  return {
    ...(status ? { status } : {}),
    // An order that was never paid for has no shipment row at all, so this
    // also excludes those — which is what a seller filtering by parcel state
    // means to ask for.
    ...(shipmentStatus?.length
      ? { shipment: { status: { in: shipmentStatus } } }
      : {})
  };
}

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  /** SHIP-003 — buyer side of order history. */
  listForBuyer(buyerId: string, filters: OrderFilters = {}) {
    return this.list(
      { buyerId, ...narrow(filters) },
      filters.page ?? 1,
      filters.limit ?? DEFAULT_PAGE_SIZE
    );
  }

  /** SHIP-003 — seller side, same filters. */
  listForSeller(sellerId: string, filters: OrderFilters = {}) {
    return this.list(
      { sellerId, ...narrow(filters) },
      filters.page ?? 1,
      filters.limit ?? DEFAULT_PAGE_SIZE
    );
  }

  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude
    });

    // Not-found rather than forbidden: an outsider learns nothing about
    // whether the order exists (§6).
    if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
      throw new NotFoundException('Order not found');
    }

    return this.toOrderView(order);
  }

  private async list(
    where: Prisma.OrderWhereInput,
    page: number,
    limit: number
  ) {
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        // `id` breaks ties so paging stays stable for same-instant orders
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.order.count({ where })
    ]);

    return {
      items: orders.map((order) => this.toOrderView(order)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  private toOrderView(order: OrderRow) {
    return {
      id: order.id,
      checkoutSessionId: order.checkoutSessionId,
      status: order.status,
      subtotal: order.subtotal.toFixed(2),
      createdAt: order.createdAt,
      buyer: {
        id: order.buyer.id,
        displayName: order.buyer.profile?.displayName ?? null
      },
      seller: {
        id: order.seller.id,
        displayName: order.seller.profile?.displayName ?? null
      },
      shipment: order.shipment
        ? {
            status: order.shipment.status,
            trackingNumber: order.shipment.trackingNumber,
            carrier: order.shipment.carrier
          }
        : null,
      shippingAddress: order.address
        ? {
            recipientName: order.address.recipientName,
            line1: order.address.line1,
            line2: order.address.line2,
            city: order.address.city,
            postalCode: order.address.postalCode,
            phone: order.address.phone
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.unitPrice.mul(item.quantity).toFixed(2),
        product: {
          id: item.product.id,
          title: item.product.title,
          imageUrl: item.product.images[0]?.url ?? null
        }
      }))
    };
  }
}
