"use client"

import { useState } from "react"
import { Clock } from "lucide-react"

import { AuctionCountdown } from "@/components/auction/auction-countdown"

/**
 * LIV-003 flair for list cards — same ticking `AuctionCountdown` the arena
 * page uses, but fed from `currentEndAt` instead of the server's
 * `msUntilEnd`. `useCountdown` (see its own comment) exists specifically to
 * avoid the client clock, so this is a deliberate downgrade: fine for a
 * card's "hurry up" cue, not something the arena's bid flow should ever use.
 * `useState`'s initializer runs once at mount, so the deadline is captured a
 * single time rather than drifting forward on every re-render.
 */
export function AuctionCountdownChip({
  currentEndAt,
}: {
  currentEndAt: string
}) {
  const [msRemaining] = useState(
    () => new Date(currentEndAt).getTime() - Date.now()
  )

  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-r1 bg-linear-to-b from-amber-400 to-amber-500 px-2.5 py-1.5 shadow-amber">
      <Clock className="size-3.5 shrink-0 text-ink" />
      <span className="text-[11px] font-bold text-ink">ปิดใน</span>
      <AuctionCountdown
        msRemaining={msRemaining}
        completeLabel="ปิดแล้ว"
        className="ml-auto text-[13px] font-extrabold text-ink"
      />
    </div>
  )
}
