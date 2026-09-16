import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { OrderStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;

/**
 * ADM-006 — Order overview (owner: Dev 3)
 *
 * Read-only per ADM-006 — do not add methods here that write to orders.
 *
 * Privacy caution (SRS §6): return only the summary-level data ADM-006 names
 * (buyer, seller, status, total) — never the full shipping address or the
 * content of buyer/seller conversations, which §6 bars admins from accessing
 * in V1.
 */
@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(status?: OrderStatus, page = 1, limit = DEFAULT_PAGE_SIZE) {
    const where: Prisma.OrderWhereInput = status ? { status } : {};

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        // Summary fields only — no shippingAddress, no conversation (SRS §6)
        select: {
          id: true,
          checkoutSessionId: true,
          status: true,
          subtotal: true,
          createdAt: true,
          buyer: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } }
            }
          },
          seller: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } }
            }
          },
          shipment: { select: { status: true } },
          _count: { select: { items: true } }
        },
        // `id` breaks ties so paging stays stable for same-instant orders
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.order.count({ where })
    ]);

    return {
      items: orders.map((order) => ({
        id: order.id,
        checkoutSessionId: order.checkoutSessionId,
        status: order.status,
        subtotal: order.subtotal.toFixed(2),
        itemCount: order._count.items,
        shipmentStatus: order.shipment?.status ?? null,
        createdAt: order.createdAt,
        buyer: {
          id: order.buyer.id,
          email: order.buyer.email,
          displayName: order.buyer.profile?.displayName ?? null
        },
        seller: {
          id: order.seller.id,
          email: order.seller.email,
          displayName: order.seller.profile?.displayName ?? null
        }
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }
}
