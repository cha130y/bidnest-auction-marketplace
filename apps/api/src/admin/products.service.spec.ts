import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminProductsService } from './products.service';

describe('AdminProductsService', () => {
  let service: AdminProductsService;
  let prisma: { product: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { product: { findMany: jest.fn().mockResolvedValue([]) } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminProductsService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = moduleRef.get(AdminProductsService);
  });

  describe('listProducts', () => {
    it('filters by status when asked', async () => {
      await service.listProducts({ status: 'SUSPENDED' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'SUSPENDED' } })
      );
    });

    it('flattens the seller’s profile into a single displayName field', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          title: 'Keyboard',
          status: 'ACTIVE',
          stockQty: 3,
          seller: {
            id: 's1',
            email: 'seller@example.com',
            profile: { displayName: 'Somchai Shop' }
          }
        }
      ]);

      const [row] = await service.listProducts();

      expect(row.seller).toEqual({
        id: 's1',
        email: 'seller@example.com',
        displayName: 'Somchai Shop'
      });
    });

    it('falls back to null when the seller has no profile', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          title: 'Keyboard',
          status: 'ACTIVE',
          stockQty: 3,
          seller: { id: 's1', email: 'seller@example.com', profile: null }
        }
      ]);

      const [row] = await service.listProducts();

      expect(row.seller.displayName).toBeNull();
    });
  });
});
