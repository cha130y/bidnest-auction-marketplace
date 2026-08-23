import { Prisma } from '../../generated/prisma/client';
import { toAuctionEndedEvent } from './auction-ended-event.mapper';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const ENDED_AT = new Date('2026-09-01T12:00:00.000Z');

const winner = {
  id: 'bid-1',
  amount: new Prisma.Decimal(5000),
  bidder: { profile: { displayName: 'Somchai' } }
};

describe('toAuctionEndedEvent (LIV-004)', () => {
  const settled = (sold: boolean, hasWinner = sold) =>
    toAuctionEndedEvent({
      id: AUCTION_ID,
      sold,
      endedAt: ENDED_AT,
      bidCount: hasWinner ? 3 : 0,
      winner: hasWinner ? winner : null
    });

  describe('a sale', () => {
    it('announces the outcome, the price and when it ended', () => {
      expect(settled(true)).toMatchObject({
        auctionId: AUCTION_ID,
        status: 'SOLD',
        soldPrice: '5000',
        endedAt: ENDED_AT,
        bidCount: 3
      });
    });

    // BID-005's rule, so the winner reads as the same person who was leading
    it('names the winner masked', () => {
      expect(settled(true).winner).toBe('S***i');
    });
  });

  describe('an auction that did not sell', () => {
    it('announces UNSOLD with no price and nobody named', () => {
      expect(settled(false, true)).toMatchObject({
        status: 'UNSOLD',
        soldPrice: null,
        winner: null
      });
    });

    it('announces an auction nobody bid on', () => {
      expect(settled(false, false)).toMatchObject({
        status: 'UNSOLD',
        bidCount: 0,
        soldPrice: null,
        winner: null
      });
    });
  });

  // AUC-003 over the wire: the reserve never leaves the server, and neither
  // does the winner's id
  it('carries no reserve and no identifier for anybody', () => {
    const event = settled(true);

    expect(event).not.toHaveProperty('reservePrice');
    expect(event).not.toHaveProperty('winnerUserId');
    expect(event).not.toHaveProperty('bidderId');
    expect(JSON.stringify(event)).not.toContain('Somchai');
  });
});
