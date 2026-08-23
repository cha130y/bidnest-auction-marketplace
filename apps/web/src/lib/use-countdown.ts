"use client"

import { useEffect, useState } from "react"

export type Countdown = {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  isComplete: boolean
  /**
   * False until the first tick runs in the browser.
   *
   * A countdown rendered on the server and then hydrated would disagree with
   * itself by however long the response took to arrive, so callers render a
   * placeholder until this turns true rather than a number that is about to
   * jump.
   */
  isReady: boolean
}

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * LIV-001 — counts down the milliseconds the *server* said were left.
 *
 * The deadline is fixed once, at the moment this starts running, and every
 * tick after that subtracts only how much local time has passed since. The
 * browser's clock is never compared against the server's, so a device set to
 * the wrong date — or the wrong timezone, or drifting by a minute — still
 * counts down to the same instant the server will close the auction at.
 *
 * That is the reason `calculateCountdown` sends `msUntilEnd` alongside
 * `endsAt`: `new Date(endsAt) - Date.now()` would import the visitor's clock
 * error straight into the number that decides whether they think they still
 * have time to bid.
 *
 * Restarts whenever `msRemaining` changes, which is what a fresh read of the
 * arena — or an anti-sniping extension (BID-004) — arrives as.
 */
export function useCountdown(msRemaining: number): Countdown {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const startedAt = Date.now()

    const tick = () =>
      setRemaining(Math.max(msRemaining - (Date.now() - startedAt), 0))

    tick()
    const interval = window.setInterval(tick, SECOND)

    return () => window.clearInterval(interval)
  }, [msRemaining])

  if (remaining === null) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalMs: msRemaining,
      isComplete: false,
      isReady: false,
    }
  }

  return {
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / SECOND),
    totalMs: remaining,
    isComplete: remaining === 0,
    isReady: true,
  }
}
