import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOverviewService } from './overview.service';

describe('AdminOverviewService', () => {
  let service: AdminOverviewService;
  let prisma: {
    user: { count: jest.Mock };
    auction: { count: jest.Mock };
    product: { count: jest.Mock };
    order: { aggregate: jest.Mock };
    adminAction: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(0) },
      auction: { count: jest.fn().mockResolvedValue(0) },
      product: { count: jest.fn().mockResolvedValue(0) },
      order: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _count: 0, _sum: { subtotal: null } })
      },
      adminAction: { count: jest.fn().mockResolvedValue(0) }
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOverviewService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = moduleRef.get(AdminOverviewService);
  });

  it('shapes real counts into the summary the dashboard reads', async () => {
    prisma.user.count.mockResolvedValueOnce(42).mockResolvedValueOnce(3);
    prisma.auction.count.mockResolvedValueOnce(5).mockResolvedValueOnce(10);
    prisma.product.count.mockResolvedValueOnce(7).mockResolvedValueOnce(9);
    prisma.order.aggregate.mockResolvedValue({
      _count: 4,
      _sum: { subtotal: 1234.5 }
    });
    prisma.adminAction.count.mockResolvedValue(2);

    const result = await service.getOverview();

    expect(result).toEqual({
      users: { total: 42, suspended: 3 },
      auctions: { active: 5, total: 10 },
      products: { active: 7, total: 9 },
      orders: { paidCount: 4, paidTotal: '1234.5' },
      adminActionsLast24h: 2
    });
  });

  it('reports zero paid revenue as "0" rather than null when there are no paid orders', async () => {
    prisma.order.aggregate.mockResolvedValue({
      _count: 0,
      _sum: { subtotal: null }
    });

    const result = await service.getOverview();

    expect(result.orders).toEqual({ paidCount: 0, paidTotal: '0' });
  });

  it('only counts PAID orders towards revenue', async () => {
    await service.getOverview();

    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PAID' } })
    );
  });
});
