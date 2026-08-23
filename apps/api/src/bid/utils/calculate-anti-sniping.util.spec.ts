import {
  ANTI_SNIPING_WINDOW_MS,
  calculateAntiSniping,
  MAX_EXTENSIONS
} from './calculate-anti-sniping.util';

const NOW = new Date('2026-08-21T12:00:00.000Z');

/** An auction ending `msFromNow` milliseconds after NOW. */
const endingIn = (msFromNow: number, extensionCount = 0) => ({
  currentEndAt: new Date(NOW.getTime() + msFromNow),
  extensionCount
});

const minutes = (count: number) => count * 60 * 1000;

describe('calculateAntiSniping (BID-004)', () => {
  describe('the two-minute window', () => {
    it('does not extend a bid with plenty of time left', () => {
      expect(calculateAntiSniping(endingIn(minutes(10)), NOW)).toEqual({
        extends: false
      });
    });

    it('does not extend a bid just outside the window', () => {
      const decision = calculateAntiSniping(
        endingIn(ANTI_SNIPING_WINDOW_MS + 1),
        NOW
      );

      expect(decision.extends).toBe(false);
    });

    it('extends a bid exactly on the window boundary', () => {
      const decision = calculateAntiSniping(
        endingIn(ANTI_SNIPING_WINDOW_MS),
        NOW
      );

      expect(decision.extends).toBe(true);
    });

    it('extends a bid in the last second', () => {
      expect(calculateAntiSniping(endingIn(1000), NOW).extends).toBe(true);
    });

    // the lifecycle pass may not have settled it yet, and the bid endpoint
    // refuses it separately — this stays consistent rather than deciding twice
    it('still extends when the end time has just gone by', () => {
      expect(calculateAntiSniping(endingIn(-1000), NOW).extends).toBe(true);
    });
  });

  describe('how much time it adds', () => {
    it('pushes the end out by two minutes', () => {
      const decision = calculateAntiSniping(endingIn(minutes(1)), NOW);

      if (!decision.extends) throw new Error('expected an extension');
      expect(
        decision.newEndAt.getTime() - decision.previousEndAt.getTime()
      ).toBe(minutes(2));
    });

    // otherwise two bids a second apart would each push the end two minutes
    // past themselves, and the auction would drift
    it('measures from the end time, not from the moment of the bid', () => {
      const auction = endingIn(minutes(1));

      const decision = calculateAntiSniping(auction, NOW);

      if (!decision.extends) throw new Error('expected an extension');
      expect(decision.newEndAt).toEqual(
        new Date(auction.currentEndAt.getTime() + minutes(2))
      );
      // three minutes from now, not two
      expect(decision.newEndAt.getTime() - NOW.getTime()).toBe(minutes(3));
    });

    it('reports the end time it is replacing', () => {
      const auction = endingIn(minutes(1));

      const decision = calculateAntiSniping(auction, NOW);

      if (!decision.extends) throw new Error('expected an extension');
      expect(decision.previousEndAt).toEqual(auction.currentEndAt);
    });
  });

  describe('the cap of five', () => {
    it.each([0, 1, 2, 3, 4])(
      'still extends when %i extensions have been used',
      (used) => {
        const decision = calculateAntiSniping(endingIn(minutes(1), used), NOW);

        expect(decision.extends).toBe(true);
        if (!decision.extends) return;
        expect(decision.extensionNumber).toBe(used + 1);
      }
    );

    it('stops at the fifth', () => {
      expect(
        calculateAntiSniping(endingIn(minutes(1), MAX_EXTENSIONS), NOW).extends
      ).toBe(false);
    });

    it('stays stopped beyond it', () => {
      expect(
        calculateAntiSniping(endingIn(minutes(1), MAX_EXTENSIONS + 3), NOW)
          .extends
      ).toBe(false);
    });

    // the auction keeps taking bids, it just stops moving
    it('caps the extensions, not the bidding', () => {
      const decision = calculateAntiSniping(
        endingIn(minutes(1), MAX_EXTENSIONS),
        NOW
      );

      expect(decision).toEqual({ extends: false });
    });
  });

  it('numbers extensions in order so each one is recorded distinctly', () => {
    const first = calculateAntiSniping(endingIn(minutes(1), 0), NOW);
    const second = calculateAntiSniping(endingIn(minutes(1), 1), NOW);

    if (!first.extends || !second.extends) throw new Error('expected both');
    expect(first.extensionNumber).toBe(1);
    expect(second.extensionNumber).toBe(2);
  });
});
