/**
 * LIV-001 — what a countdown on screen needs from the server.
 *
 * Both the absolute times and the remaining milliseconds are sent, which looks
 * redundant but is not: a client whose clock is right can tick down from
 * `startsAt` on its own and never ask again, while one whose clock is minutes
 * off would render nonsense from it — that client ticks down from `msUntil…`
 * instead. Sending only one of the two forces a choice that is wrong for
 * somebody, and the pair costs a few bytes.
 */
export type Countdown = {
  serverTime: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  msUntilStart: number | null;
  msUntilEnd: number | null;
};

type CountdownSource = {
  scheduledStartAt: Date | null;
  currentEndAt: Date | null;
};

export function calculateCountdown(
  auction: CountdownSource,
  now: Date
): Countdown {
  return {
    serverTime: now,
    startsAt: auction.scheduledStartAt,
    endsAt: auction.currentEndAt,
    msUntilStart: msUntil(auction.scheduledStartAt, now),
    msUntilEnd: msUntil(auction.currentEndAt, now)
  };
}

/**
 * Never negative. A moment that has passed reads as 0 rather than as a
 * negative number, so a client can render `msUntil…` without guarding it —
 * "how long left" has no meaning below zero, and the status is what says
 * whether the auction is running.
 *
 * Null stays null: a draft that was never scheduled has no time to count down
 * to, which is different from having none left.
 */
function msUntil(target: Date | null, now: Date): number | null {
  if (target === null) return null;

  return Math.max(0, target.getTime() - now.getTime());
}
