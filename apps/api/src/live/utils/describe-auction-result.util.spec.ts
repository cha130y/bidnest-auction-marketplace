import { describeAuctionResult } from './describe-auction-result.util';

const ENDED_AT = new Date('2026-09-01T12:00:00.000Z');

const winner = { amount: '5000', bidder: 'S***i', isYours: false };

describe('describeAuctionResult (LIV-004)', () => {
  const settled = (
    status: 'SOLD' | 'UNSOLD',
    overrides: Partial<Parameters<typeof describeAuctionResult>[0]> = {}
  ) => ({
    status,
    endedAt: ENDED_AT,
    soldPrice: status === 'SOLD' ? '5000' : null,
    currentPrice: '5000',
    bidCount: 3,
    reserveMet: status === 'SOLD',
    ...overrides
  });

  describe('while the auction is not over', () => {
    // a block of empty fields would make "no result yet" and "sold for
    // nothing" look alike
    it.each(['SCHEDULED', 'ACTIVE'] as const)(
      'reports nothing at all for %s',
      (status) => {
        const running = { ...settled('UNSOLD'), status, endedAt: null };

        expect(describeAuctionResult(running, null)).toBeNull();
      }
    );
  });

  describe('a sale', () => {
    it('reports the outcome, the price and when it ended', () => {
      expect(describeAuctionResult(settled('SOLD'), winner)).toMatchObject({
        outcome: 'SOLD',
        soldPrice: '5000',
        finalPrice: '5000',
        endedAt: ENDED_AT,
        reserveMet: true
      });
    });

    it('names the winner, masked, and never by id', () => {
      const result = describeAuctionResult(settled('SOLD'), winner);

      expect(result?.winner).toEqual(winner);
      expect(result?.winner).not.toHaveProperty('bidderId');
    });
  });

  describe('an auction that did not sell', () => {
    it('reports UNSOLD with no sale price', () => {
      expect(describeAuctionResult(settled('UNSOLD'), null)).toMatchObject({
        outcome: 'UNSOLD',
        soldPrice: null,
        reserveMet: false
      });
    });

    // "ราคาสุดท้าย" for an auction that did not sell is what the bidding got to
    it('still reports how far the bidding got', () => {
      expect(describeAuctionResult(settled('UNSOLD'), null)?.finalPrice).toBe(
        '5000'
      );
    });

    // the top bidder on an unsold auction did not win it
    it('names nobody as the winner, even if a bid was leading', () => {
      expect(
        describeAuctionResult(settled('UNSOLD'), winner)?.winner
      ).toBeNull();
    });

    it('has no final price when nobody bid at all', () => {
      const noBids = settled('UNSOLD', { bidCount: 0, currentPrice: '0' });

      expect(describeAuctionResult(noBids, null)).toMatchObject({
        finalPrice: null,
        soldPrice: null,
        winner: null
      });
    });
  });
});
