import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NegotiatorFacadeService } from './negotiator-facade.service';
import { NegotiatorService } from './negotiator.service';

describe('NegotiatorFacadeService', () => {
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
  const BUYER_ID = '22222222-2222-4222-8222-222222222222';
  const SELLER_ID = '33333333-3333-4333-8333-333333333333';
  const OFFER_ID = '44444444-4444-4444-8444-444444444444';

  let service: NegotiatorFacadeService;
  let prisma: {
    product: { findUnique: jest.Mock };
    offer: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    aIRequest: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  type UpdateManyArgs = {
    where: { id: string; decision: string; expiresAt: { gt: Date } };
    data: { expiresAt: Date };
  };
  let lastUpdateManyArgs: UpdateManyArgs | undefined;

  const decimal = (value: number) => ({ toNumber: () => value });

  const productRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: PRODUCT_ID,
    sellerId: SELLER_ID,
    status: 'ACTIVE',
    price: decimal(200),
    stockQty: 10,
    negotiationFloor: decimal(100),
    ...overrides
  });

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(productRow()) },
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: OFFER_ID, ...data })
          ),
        updateMany: jest.fn().mockImplementation((args: UpdateManyArgs) => {
          lastUpdateManyArgs = args;
          return Promise.resolve({ count: 1 });
        })
      },
      aIRequest: { create: jest.fn() },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.token'),
      verifyAsync: jest.fn().mockResolvedValue({
        offerId: OFFER_ID,
        productId: PRODUCT_ID,
        buyerId: BUYER_ID
      })
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NegotiatorFacadeService,
        NegotiatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: () => 'test-negotiator-secret' }
        }
      ]
    }).compile();

    service = moduleRef.get(NegotiatorFacadeService);
  });

  it('accepts a strong offer and returns a signed accept token', async () => {
    const result = await service.negotiate(PRODUCT_ID, BUYER_ID, 1, 200);

    expect(result.decision).toBe('ACCEPTED');
    expect(result.acceptToken).toBe('signed.token');
    expect(prisma.aIRequest.create).toHaveBeenCalledWith({
      data: { userId: BUYER_ID, type: 'NEGOTIATION' }
    });
  });

  it('does not issue an accept token for a countered or rejected offer', async () => {
    const countered = await service.negotiate(PRODUCT_ID, BUYER_ID, 1, 150);
    expect(countered.decision).toBe('COUNTERED');
    expect(countered.acceptToken).toBeNull();

    const rejected = await service.negotiate(PRODUCT_ID, BUYER_ID, 1, 50);
    expect(rejected.decision).toBe('REJECTED');
    expect(rejected.acceptToken).toBeNull();
  });

  it('refuses to negotiate on a product with no negotiation floor set', async () => {
    prisma.product.findUnique.mockResolvedValue(
      productRow({ negotiationFloor: null })
    );

    await expect(
      service.negotiate(PRODUCT_ID, BUYER_ID, 1, 200)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses the seller negotiating on their own listing', async () => {
    await expect(
      service.negotiate(PRODUCT_ID, SELLER_ID, 1, 200)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s on a product that does not exist or is not ACTIVE', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(
      service.negotiate(PRODUCT_ID, BUYER_ID, 1, 200)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces the 5-minute cooldown between offers', async () => {
    prisma.offer.findMany.mockResolvedValue([{ createdAt: new Date() }]);

    await expect(
      service.negotiate(PRODUCT_ID, BUYER_ID, 1, 200)
    ).rejects.toThrow(/wait/i);
  });

  it('enforces the 3-attempts-per-24h cap', async () => {
    const now = new Date();
    prisma.offer.findMany.mockResolvedValue([
      { createdAt: new Date(now.getTime() - 10 * 60_000) },
      { createdAt: new Date(now.getTime() - 20 * 60_000) },
      { createdAt: new Date(now.getTime() - 30 * 60_000) }
    ]);

    await expect(
      service.negotiate(PRODUCT_ID, BUYER_ID, 1, 200)
    ).rejects.toThrow(/maximum number of offers/i);
  });

  describe('verifyAndConsumeAcceptToken', () => {
    it('consumes a valid, unexpired accept token exactly once', async () => {
      const payload = await service.verifyAndConsumeAcceptToken('a.jwt.token');

      expect(payload.offerId).toBe(OFFER_ID);
      expect(lastUpdateManyArgs?.where.id).toBe(OFFER_ID);
      expect(lastUpdateManyArgs?.where.decision).toBe('ACCEPTED');
      expect(lastUpdateManyArgs?.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(lastUpdateManyArgs?.data.expiresAt).toEqual(new Date(0));
    });

    it('rejects a token whose offer was already consumed (updateMany matches nothing)', async () => {
      prisma.offer.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.verifyAndConsumeAcceptToken('a.jwt.token')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a token that fails signature/expiry verification', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        service.verifyAndConsumeAcceptToken('bad.token')
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
