import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ADM-002/004's own dashboard needs a place to land — a single admin role
 * covers every module (ADR-0001), so this reaches across all of them with
 * plain `count()`s rather than guessing which owner's endpoint should carry
 * it. Every number here is a real read, never a placeholder — the point of
 * building this at all was that the FE previously showed no numbers rather
 * than invented ones.
 */
@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalUsers,
      suspendedUsers,
      activeAuctions,
      totalAuctions,
      activeProducts,
      totalProducts,
      paidOrders,
      recentActions
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.auction.count({
        where: { status: 'ACTIVE', deletedAt: null }
      }),
      this.prisma.auction.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.product.count(),
      this.prisma.order.aggregate({
        where: { status: 'PAID' },
        _count: true,
        _sum: { subtotal: true }
      }),
      this.prisma.adminAction.count({
        where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      })
    ]);

    return {
      users: { total: totalUsers, suspended: suspendedUsers },
      auctions: { active: activeAuctions, total: totalAuctions },
      products: { active: activeProducts, total: totalProducts },
      orders: {
        paidCount: paidOrders._count,
        paidTotal: (paidOrders._sum.subtotal ?? 0).toString()
      },
      adminActionsLast24h: recentActions
    };
  }
}
