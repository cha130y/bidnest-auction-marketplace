import { describeBiddingAccess } from './describe-bidding-access.util';

const SELLER_ID = '00000000-0000-4000-8000-0000000006a1';
const BUYER_ID = '00000000-0000-4000-8000-0000000006b2';

describe('describeBiddingAccess (LIV-002)', () => {
  const running = { biddingOpen: true, seller: { id: SELLER_ID } };
  const notRunning = { biddingOpen: false, seller: { id: SELLER_ID } };
  const buyer = { id: BUYER_ID, role: 'USER' } as const;

  it('lets an ordinary user bid on a running auction', () => {
    expect(describeBiddingAccess(running, buyer)).toEqual({
      canBid: true,
      blockedBy: null
    });
  });

  it('refuses an auction that is not open for bidding', () => {
    expect(describeBiddingAccess(notRunning, buyer)).toEqual({
      canBid: false,
      blockedBy: 'AUCTION_NOT_OPEN'
    });
  });

  // BID-001 — a seller cannot bid on their own auction
  it('refuses the seller of the auction', () => {
    expect(
      describeBiddingAccess(running, { id: SELLER_ID, role: 'USER' })
    ).toEqual({ canBid: false, blockedBy: 'YOU_ARE_THE_SELLER' });
  });

  // SRS 2 — admins moderate the marketplace, they do not take part in it
  it('refuses an admin', () => {
    expect(
      describeBiddingAccess(running, { id: BUYER_ID, role: 'ADMIN' })
    ).toEqual({ canBid: false, blockedBy: 'ADMINS_DO_NOT_BID' });
  });

  // the state of the room is the same answer for everybody, and a personal
  // reason stacked on top of it would only be noise
  it('reports the auction being closed before a personal reason', () => {
    expect(
      describeBiddingAccess(notRunning, { id: SELLER_ID, role: 'USER' })
    ).toMatchObject({ blockedBy: 'AUCTION_NOT_OPEN' });

    expect(
      describeBiddingAccess(notRunning, { id: BUYER_ID, role: 'ADMIN' })
    ).toMatchObject({ blockedBy: 'AUCTION_NOT_OPEN' });
  });

  it('always pairs canBid false with a reason', () => {
    const cases = [
      describeBiddingAccess(notRunning, buyer),
      describeBiddingAccess(running, { id: SELLER_ID, role: 'USER' }),
      describeBiddingAccess(running, { id: BUYER_ID, role: 'ADMIN' })
    ];

    for (const result of cases) {
      expect(result.canBid).toBe(false);
      expect(result.blockedBy).not.toBeNull();
    }
  });
});
