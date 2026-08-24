import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiClientService } from './gemini-client.service';
import { PriceEstimatorService } from './price-estimator.service';

/**
 * AI-002 — the decision/validation logic around the Gemini call, which is
 * exactly the part an e2e test can't reach without spending a real API quota
 * on every CI run. GeminiClientService is mocked; the retry/timeout behaviour
 * it owns is already covered on its own.
 */
describe('PriceEstimatorService', () => {
  const AUCTION_ID = '11111111-1111-4111-8111-111111111111';
  const SELLER_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';

  let service: PriceEstimatorService;
  let prisma: {
    auction: { findUnique: jest.Mock };
    aIRequest: { create: jest.Mock };
  };
  let gemini: { generateVisionJson: jest.Mock };

  const auctionRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: AUCTION_ID,
    sellerId: SELLER_ID,
    status: 'DRAFT',
    condition: 'USED',
    category: { name: 'Watches' },
    images: [{ url: 'https://cdn.example/photo.jpg' }],
    ...overrides
  });

  const validEstimate = {
    suggestedStartingPrice: 500,
    estimatedClosingRangeLow: 600,
    estimatedClosingRangeHigh: 900,
    reason: 'สภาพดี ตามราคาตลาดของหมวดหมู่นี้'
  };

  beforeEach(async () => {
    prisma = {
      auction: { findUnique: jest.fn().mockResolvedValue(auctionRow()) },
      aIRequest: { create: jest.fn() }
    };
    gemini = {
      generateVisionJson: jest
        .fn()
        .mockResolvedValue(JSON.stringify(validEstimate))
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceEstimatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiClientService, useValue: gemini }
      ]
    }).compile();

    service = moduleRef.get(PriceEstimatorService);
  });

  it('returns the parsed estimate for the draft owner', async () => {
    const result = await service.estimate(AUCTION_ID, SELLER_ID);

    expect(result).toEqual(validEstimate);
    expect(prisma.aIRequest.create).toHaveBeenCalledWith({
      data: { userId: SELLER_ID, type: 'PRICE_ESTIMATE' }
    });
  });

  it('rejects someone who is not the draft owner', async () => {
    await expect(
      service.estimate(AUCTION_ID, OTHER_USER_ID)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gemini.generateVisionJson).not.toHaveBeenCalled();
  });

  it('404s when the auction does not exist', async () => {
    prisma.auction.findUnique.mockResolvedValue(null);

    await expect(
      service.estimate(AUCTION_ID, SELLER_ID)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to estimate an auction that already started', async () => {
    prisma.auction.findUnique.mockResolvedValue(
      auctionRow({ status: 'ACTIVE' })
    );

    await expect(
      service.estimate(AUCTION_ID, SELLER_ID)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gemini.generateVisionJson).not.toHaveBeenCalled();
  });

  it('refuses when the draft has no photos yet', async () => {
    prisma.auction.findUnique.mockResolvedValue(auctionRow({ images: [] }));

    await expect(
      service.estimate(AUCTION_ID, SELLER_ID)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gemini.generateVisionJson).not.toHaveBeenCalled();
  });

  it('treats a malformed Gemini response as a failed estimate, not a crash', async () => {
    gemini.generateVisionJson.mockResolvedValue('not json at all');

    await expect(
      service.estimate(AUCTION_ID, SELLER_ID)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a response missing required fields even if it is valid JSON', async () => {
    gemini.generateVisionJson.mockResolvedValue(
      JSON.stringify({ reason: 'only this' })
    );

    await expect(
      service.estimate(AUCTION_ID, SELLER_ID)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
