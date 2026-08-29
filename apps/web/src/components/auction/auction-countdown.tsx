"use client"

import { cn } from "@/lib/utils"
import { useCountdown } from "@/lib/use-countdown"

const pad = (value: number) => String(value).padStart(2, "0")

/**
 * LIV-001 / LIV-003 — the time left, ticking.
 *
 * `msRemaining` comes from the API's `msUntilEnd` (or `msUntilStart`) rather
 * than from a timestamp the browser subtracts its own clock from — see
 * `useCountdown` for why that distinction decides whether the number on screen
 * agrees with the server enforcing it.
 *
 * `urgent` is passed in rather than worked out from a threshold here: whether
 * an auction is in its closing window is `suddenDeath.active`, which the API
 * computes from the same constants BID-004 extends by. A second definition on
 * screen could disagree with the one that actually moves the deadline.
 */
export function AuctionCountdown({
  msRemaining,
  urgent = false,
  completeLabel = "หมดเวลาแล้ว",
  className,
}: {
  msRemaining: number
  urgent?: boolean
  completeLabel?: string
  className?: string
}) {
  const countdown = useCountdown(msRemaining)

  if (!countdown.isReady) {
    // Same width as the real value, so nothing shifts when it appears
    return (
      <span
        className={cn("font-display tabular-nums text-n-400", className)}
        aria-hidden="true"
      >
        --:--:--
      </span>
    )
  }

  if (countdown.isComplete) {
    return (
      <span className={cn("font-display text-n-500", className)}>
        {completeLabel}
      </span>
    )
  }

  const { days, hours, minutes, seconds } = countdown

  return (
    <span
      // The clock is the one thing on the page that changes without the
      // visitor doing anything, so a screen reader is told rather than left to
      // discover it — politely, because it changes every second.
      role="timer"
      aria-live="off"
      className={cn(
        "font-display tabular-nums",
        urgent ? "text-red" : "text-ink",
        className
      )}
    >
      {days > 0 && `${days} วัน `}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  )
}
