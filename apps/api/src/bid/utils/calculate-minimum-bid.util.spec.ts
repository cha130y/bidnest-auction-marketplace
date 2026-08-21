import { Prisma } from '../../../generated/prisma/client';
import { calculateMinimumBid } from './calculate-minimum-bid.util';

const dec = (value: string | number) => new Prisma.Decimal(value);

const auction = (overrides: Record<string, unknown> = {}) => ({
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  currentPrice: dec(0),
  bidCount: 0,
  ...overrides
});

describe('calculateMinimumBid (BID-001)', () => {
  describe('before anybody has bid', () => {
    // currentPrice is 0 here, and 0 + increment would undercut the seller
    it('asks for the starting price, not one increment', () => {
      expect(calculateMinimumBid(auction()).toString()).toBe('3000');
    });

    it('ignores currentPrice entirely while the count is zero', () => {
      const minimum = calculateMinimumBid(
        auction({ currentPrice: dec(999999) })
      );

      expect(minimum.toString()).toBe('3000');
    });
  });

  describe('once bidding has started', () => {
    it('asks for the current price plus the increment', () => {
      const minimum = calculateMinimumBid(
        auction({ currentPrice: dec(3000), bidCount: 1 })
      );

      expect(minimum.toString()).toBe('3100');
    });

    it('keeps climbing with each bid', () => {
      const minimum = calculateMinimumBid(
        auction({ currentPrice: dec(7400), bidCount: 12 })
      );

      expect(minimum.toString()).toBe('7500');
    });

    it('no longer looks at the starting price', () => {
      const minimum = calculateMinimumBid(
        auction({ startingPrice: dec(1), currentPrice: dec(5000), bidCount: 4 })
      );

      expect(minimum.toString()).toBe('5100');
    });
  });

  it('works in satang, not floating point', () => {
    const minimum = calculateMinimumBid(
      auction({
        currentPrice: dec('0.10'),
        minBidIncrement: dec('0.20'),
        bidCount: 1
      })
    );

    // 0.1 + 0.2 is 0.30000000000000004 as a float
    expect(minimum.toString()).toBe('0.3');
  });
});
