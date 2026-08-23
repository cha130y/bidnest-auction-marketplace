import { calculateCountdown } from './calculate-countdown.util';

describe('calculateCountdown (LIV-001)', () => {
  const now = new Date('2026-09-01T10:00:00.000Z');
  const inFiveMinutes = new Date('2026-09-01T10:05:00.000Z');
  const inAnHour = new Date('2026-09-01T11:00:00.000Z');

  it('reports the time left until the auction starts and ends', () => {
    const countdown = calculateCountdown(
      { scheduledStartAt: inFiveMinutes, currentEndAt: inAnHour },
      now
    );

    expect(countdown).toEqual({
      serverTime: now,
      startsAt: inFiveMinutes,
      endsAt: inAnHour,
      msUntilStart: 5 * 60 * 1000,
      msUntilEnd: 60 * 60 * 1000
    });
  });

  it('sends its own clock, so a client can tell it is behind', () => {
    const countdown = calculateCountdown(
      { scheduledStartAt: null, currentEndAt: null },
      now
    );

    expect(countdown.serverTime).toEqual(now);
  });

  describe('a moment that has already passed', () => {
    const anHourAgo = new Date('2026-09-01T09:00:00.000Z');

    it('counts down to zero rather than into negative numbers', () => {
      const countdown = calculateCountdown(
        { scheduledStartAt: anHourAgo, currentEndAt: inAnHour },
        now
      );

      expect(countdown.msUntilStart).toBe(0);
    });

    it('still reports when it was, so the screen can say "started at"', () => {
      const countdown = calculateCountdown(
        { scheduledStartAt: anHourAgo, currentEndAt: inAnHour },
        now
      );

      expect(countdown.startsAt).toEqual(anHourAgo);
    });
  });

  it('reads exactly zero at the instant it arrives', () => {
    const countdown = calculateCountdown(
      { scheduledStartAt: now, currentEndAt: inAnHour },
      now
    );

    expect(countdown.msUntilStart).toBe(0);
  });

  // no time to count down to is not the same as no time left
  it('keeps null for a time that was never set', () => {
    const countdown = calculateCountdown(
      { scheduledStartAt: null, currentEndAt: inAnHour },
      now
    );

    expect(countdown.startsAt).toBeNull();
    expect(countdown.msUntilStart).toBeNull();
    expect(countdown.msUntilEnd).toBe(60 * 60 * 1000);
  });
});
