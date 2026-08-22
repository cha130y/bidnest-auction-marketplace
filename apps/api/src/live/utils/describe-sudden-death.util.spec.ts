import { describeSuddenDeath } from './describe-sudden-death.util';

const MINUTE = 60 * 1000;
const NOW = new Date('2026-09-01T12:00:00.000Z');
const inMinutes = (count: number) => new Date(NOW.getTime() + count * MINUTE);

const lastExtension = {
  extensionNumber: 2,
  previousEndAt: inMinutes(-1),
  newEndAt: inMinutes(1)
};

describe('describeSuddenDeath (LIV-003)', () => {
  const running = (endsInMinutes: number, extensionCount = 0) => ({
    biddingOpen: true,
    currentEndAt: inMinutes(endsInMinutes),
    extensionCount
  });

  describe('when the urgent state turns on', () => {
    it('is off while there is plenty of time left', () => {
      expect(describeSuddenDeath(running(30), null, NOW).active).toBe(false);
    });

    it('is on inside the last two minutes', () => {
      expect(describeSuddenDeath(running(1), null, NOW).active).toBe(true);
    });

    // the boundary is the same one a bid is judged against (BID-004)
    it('is on at exactly two minutes left', () => {
      expect(describeSuddenDeath(running(2), null, NOW).active).toBe(true);
    });

    it('is off a moment before that', () => {
      const auction = {
        biddingOpen: true,
        currentEndAt: new Date(NOW.getTime() + 2 * MINUTE + 1),
        extensionCount: 0
      };

      expect(describeSuddenDeath(auction, null, NOW).active).toBe(false);
    });

    it('is off once the deadline has passed', () => {
      expect(describeSuddenDeath(running(-1), null, NOW).active).toBe(false);
    });

    it('is off while bidding has not opened', () => {
      const scheduled = { ...running(1), biddingOpen: false };

      expect(describeSuddenDeath(scheduled, null, NOW).active).toBe(false);
    });

    it('is off for an auction with no deadline at all', () => {
      const undated = {
        biddingOpen: true,
        currentEndAt: null,
        extensionCount: 0
      };

      expect(describeSuddenDeath(undated, null, NOW).active).toBe(false);
    });

    // the last two minutes of an auction that can no longer be extended are
    // the most urgent moments it has, not the least
    it('stays on after the extensions are spent', () => {
      expect(describeSuddenDeath(running(1, 5), null, NOW)).toMatchObject({
        active: true,
        extensionsRemaining: 0
      });
    });
  });

  describe('what it reports', () => {
    it('counts the extensions used and the ones left', () => {
      expect(describeSuddenDeath(running(1, 2), null, NOW)).toMatchObject({
        extensionCount: 2,
        extensionsRemaining: 3
      });
    });

    it('never reports a negative number of extensions left', () => {
      expect(
        describeSuddenDeath(running(1, 9), null, NOW).extensionsRemaining
      ).toBe(0);
    });

    // a screen should not have to know the rule to describe it
    it('sends the window and the extension length rather than assuming them', () => {
      expect(describeSuddenDeath(running(30), null, NOW)).toMatchObject({
        windowMs: 2 * MINUTE,
        extensionMs: 2 * MINUTE
      });
    });

    it('passes the last extension through, old deadline and new', () => {
      expect(
        describeSuddenDeath(running(1, 2), lastExtension, NOW).lastExtension
      ).toEqual(lastExtension);
    });

    it('has no last extension before the deadline has ever moved', () => {
      expect(
        describeSuddenDeath(running(1), null, NOW).lastExtension
      ).toBeNull();
    });
  });
});
