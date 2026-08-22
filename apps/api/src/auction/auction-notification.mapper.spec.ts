import { Prisma } from '../../generated/prisma/client';
import {
  auctionCancelledNotification,
  auctionEndedNotification,
  auctionWonNotification,
  outbidNotification
} from './auction-notification.mapper';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const USER_ID = '00000000-0000-4000-8000-000000000401';
const BID_ID = '00000000-0000-4000-8000-000000000501';

const dec = (value: string | number) => new Prisma.Decimal(value);

const auction = {
  id: AUCTION_ID,
  title: 'Vintage Seiko 5 Automatic',
  currency: 'THB'
};

/**
 * NOT-001..004 — what each notification says. The rows are written by the flow
 * that raised them; this is only about their contents.
 */
describe('auction notifications (NOT-001..004)', () => {
  describe('being outbid (NOT-001)', () => {
    const row = outbidNotification(auction, USER_ID, BID_ID, dec(5000));

    it('goes to the person who lost the lead', () => {
      expect(row).toMatchObject({ userId: USER_ID, type: 'OUTBID' });
    });

    // the bell should be useful without opening it
    it('names the auction and the price that beat them', () => {
      expect(row.message).toContain('Vintage Seiko 5 Automatic');
      expect(row.message).toContain('THB 5,000.00');
    });

    // so the bell can open the auction at the moment it happened
    it('points at the auction and the bid that displaced them', () => {
      expect(row).toMatchObject({ auctionId: AUCTION_ID, bidId: BID_ID });
    });
  });

  describe('winning (NOT-002)', () => {
    const row = auctionWonNotification(auction, USER_ID, BID_ID, dec(5000));

    it('tells the winner what they won and for how much', () => {
      expect(row).toMatchObject({
        userId: USER_ID,
        type: 'AUCTION_WON',
        bidId: BID_ID
      });
      expect(row.message).toContain('Vintage Seiko 5 Automatic');
      expect(row.message).toContain('THB 5,000.00');
    });
  });

  describe('an auction ending (NOT-003)', () => {
    it('says what it sold for', () => {
      const row = auctionEndedNotification(auction, USER_ID, {
        sold: true,
        finalPrice: dec(5000)
      });

      expect(row).toMatchObject({ type: 'AUCTION_ENDED' });
      // no bid to point at: this one is about the auction, not about a bid
      expect(row).not.toHaveProperty('bidId');
      expect(row.message).toContain('sold for THB 5,000.00');
    });

    // AUC-003 — the reserve stays private after the auction ends too
    it('says the reserve was not met without saying what it was', () => {
      const row = auctionEndedNotification(auction, USER_ID, {
        sold: false,
        finalPrice: dec(3000)
      });

      expect(row.message).toContain('reserve');
      expect(row.message).not.toContain('4500');
    });

    it('distinguishes an auction nobody bid on', () => {
      const row = auctionEndedNotification(auction, USER_ID, {
        sold: false,
        finalPrice: null
      });

      expect(row.message).toContain('without a single bid');
    });
  });

  describe('a cancellation (NOT-004)', () => {
    // "cancelled" with no why is the kind of notification people raise
    // support tickets about
    it('passes the seller’s reason through', () => {
      const row = auctionCancelledNotification(
        auction,
        USER_ID,
        'Item no longer available'
      );

      expect(row).toMatchObject({
        userId: USER_ID,
        type: 'AUCTION_CANCELLED',
        auctionId: AUCTION_ID
      });
      expect(row.message).toContain('Item no longer available');
    });

    it.each([undefined, null, '', '   '])(
      'reads cleanly when the reason is %p',
      (reason) => {
        const row = auctionCancelledNotification(auction, USER_ID, reason);

        expect(row.message).not.toContain('Reason:');
        expect(row.message).toContain('Vintage Seiko 5 Automatic');
      }
    );
  });

  // VarChar(180) and VarChar(800) in the schema
  it('fits the columns even with the longest allowed title', () => {
    const long = { ...auction, title: 'x'.repeat(200) };

    const rows = [
      outbidNotification(long, USER_ID, BID_ID, dec(5000)),
      auctionWonNotification(long, USER_ID, BID_ID, dec(5000)),
      auctionEndedNotification(long, USER_ID, {
        sold: true,
        finalPrice: dec(5000)
      }),
      auctionCancelledNotification(long, USER_ID, 'x'.repeat(200))
    ];

    for (const row of rows) {
      expect(row.title.length).toBeLessThanOrEqual(180);
      expect(row.message.length).toBeLessThanOrEqual(800);
    }
  });
});
