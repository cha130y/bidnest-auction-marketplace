"use client"

import { useEffect, useState } from "react"

/**
 * AI-003 — whole minutes until an accepted offer stops being payable.
 *
 * Deliberately not `useCountdown`: that one counts down the milliseconds the
 * *server* said were left, because a live auction closing is worth protecting
 * from a viewer's wrong clock down to the second. An offer is a fifteen minute
 * window shown to one person in whole minutes, and `expiresAt` is all the API
 * sends — a device an hour out would read it wrong either way, and checkout
 * refuses a lapsed offer regardless of what any screen displayed.
 *
 * `Date.now()` is impure and cannot be called during render (react-hooks
 * purity), so the first value is seeded through a lazy initializer — React's
 * own escape hatch for reading an impure value exactly once — and every value
 * after it arrives from the interval.
 */
export function useOfferMinutesLeft(expiresAt: string): number {
  const computeMinutesLeft = () =>
    Math.max(
      0,
      Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000)
    )

  const [minutesLeft, setMinutesLeft] = useState(computeMinutesLeft)

  useEffect(() => {
    // The effect only subscribes — it never calls setState synchronously in
    // its own body, only from the interval's callback, once external time has
    // actually moved on.
    const interval = setInterval(
      () => setMinutesLeft(computeMinutesLeft()),
      30_000
    )
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt])

  return minutesLeft
}
