"use client"

import { useCallback, useState } from "react"
import { Users } from "lucide-react"

import { AuctionCountdown } from "@/components/auction/auction-countdown"
import { AuctionResultPanel } from "@/components/auction/auction-result-panel"
import { BidHistoryList } from "@/components/auction/bid-history-list"
import { KingOfTheHill } from "@/components/auction/king-of-the-hill"
import { PlaceBidControl } from "@/components/auction/place-bid-control"
import { SuddenDeathBanner } from "@/components/auction/sudden-death-banner"
import { Badge } from "@/components/ui/badge"
import { getArena } from "@/lib/api/auctions"
import { formatTHB } from "@/lib/format"
import { useAuctionRoom } from "@/lib/use-auction-room"
import { URGENCY_STYLE, describeUrgency } from "@/lib/auction-urgency"
import { cn } from "@/lib/utils"
import type { AuctionArena } from "@/lib/api/types"

/**
 * LIV-002 / LIV-003 / LIV-004 / LIV-005 — everything about an auction that
 * changes, kept in step with the room.
 *
 * A Client Component holding the arena as state, seeded with what the server
 * already rendered so there is nothing to wait for on first paint. The page
 * around it stays server-rendered; only this part needs to move.
 */
export function ArenaPanel({
  auctionId,
  initialArena,
}: {
  auctionId: string
  initialArena: AuctionArena
}) {
  const [arena, setArena] = useState(initialArena)

  /**
   * Re-reads the whole arena rather than patching a field from an event.
   *
   * The state is a set of values that have to agree — price, leader, minimum
   * next bid, deadline, extensions left — and the API computes them together.
   * Applying a price from one moment onto a deadline from another is how a
   * screen ends up offering a bid the endpoint will refuse.
   *
   * It is also what fills in `you` and `isYours`: `apiFetch` sends no bearer
   * token on the server (`authHeader()` is empty there), so the server's copy
   * always has `you: null` no matter who is looking.
   */
  const refresh = useCallback(async () => {
    try {
      setArena(await getArena(auctionId))
    } catch {
      // A failed read leaves the last good state on screen, which is the right
      // thing for a page somebody is watching: a stale price is more useful
      // than an error where the price was.
    }
  }, [auctionId])

  useAuctionRoom(auctionId, refresh)

  const { auction, countdown, suddenDeath, result, leader, you } = arena
  const hasBids = auction.bidCount > 0
  const running = auction.status === "ACTIVE"
  const price = hasBids ? auction.currentPrice : auction.startingPrice
  const urgency = describeUrgency(suddenDeath)
  const style = URGENCY_STYLE[urgency]

  return (
    <div className="flex flex-col gap-4">
      {/**
       * LIV-005 — the urgent pulse, defined here rather than in
       * `app/globals.css`.
       *
       * That file carries "Source of truth: ui_component_design.html (Figma
       * import)": it is Dev 1's, and generated. A keyframe added to it would
       * be silently dropped the next time they re-export, and a missing
       * animation breaks no build — it would just quietly stop one day.
       *
       * Every colour is `var(--color-red)`, their token, so nothing new is
       * invented here. If red ever gains a full ramp this moves into the
       * design system and the class name stays the same.
       *
       * Cheap to duplicate: identical rules collapse in the browser, and it is
       * one selector.
       */}
      <style>{PULSE_KEYFRAMES}</style>

      {suddenDeath.active && !result && (
        <SuddenDeathBanner suddenDeath={suddenDeath} />
      )}

      {result ? (
        <AuctionResultPanel result={result} />
      ) : (
        <section className={cn("rounded-r4 p-5 shadow-sh1", style.card)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={running ? "live" : "new"} dot={running}>
              {running ? "กำลังประมูล" : "ยังไม่เปิดประมูล"}
            </Badge>

            <span className="flex items-center gap-1.5 text-sm text-n-500">
              <Users className="size-4" />
              {arena.participantCount.toLocaleString("th-TH")} คนในห้อง
            </span>
          </div>

          <div className="mt-4">
            <span className="text-xs text-n-500">
              {hasBids ? "ราคาปัจจุบัน" : "ราคาเริ่มต้น"}
            </span>
            {/**
             * LIV-005 — the price has to be seen to move, not just be
             * different the next time somebody looks.
             *
             * Keyed on the amount so React replaces the node when it changes,
             * which is what restarts the animation; a class alone would only
             * play once. Nothing here schedules a timer or holds "was it just
             * updated" in state — the value being new *is* the trigger.
             *
             * `motion-safe:` because a number flashing on every bid is exactly
             * what somebody who asked for reduced motion asked to be spared.
             */}
            <div
              key={price}
              className="font-display text-3xl font-extrabold text-ink motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300"
            >
              {formatTHB(price)}
            </div>
            {leader && (
              <p className="mt-1 text-sm text-n-600">
                ผู้นำตอนนี้{" "}
                <span className="font-semibold text-ink">
                  {leader.isYours ? "คุณเอง" : leader.bidder}
                </span>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-n-200 pt-4">
            <span className={cn("text-xs font-bold tracking-[0.14em] uppercase", style.label)}>
              {!running
                ? "เริ่มอีก"
                : urgency === "suddenDeath"
                  ? "นับถอยหลังช่วงต่อเวลา"
                  : "เหลือเวลา"}
            </span>
            <AuctionCountdown
              msRemaining={
                running ? countdown.msUntilEnd : countdown.msUntilStart
              }
              urgent={urgency !== "calm"}
              completeLabel={running ? "กำลังปิดการประมูล" : "กำลังเปิดห้อง"}
              className="text-xl font-bold"
            />
          </div>

          <PlaceBidControl
            auction={auction}
            you={you}
            className="mt-5"
            onBidPlaced={refresh}
          />
        </section>
      )}

      <section className="rounded-r4 bg-white p-5 shadow-sh1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-n-500">
            เสนอราคาแล้ว {auction.bidCount.toLocaleString("th-TH")} ครั้ง
          </span>
        </div>

        {/* LIV-003 — while the deadline is live, the ranking is what people
            are watching; the chronological list is the calmer view of the
            same bids. */}
        <div className="mt-3">
          {urgency === "calm" ? (
            <BidHistoryList bids={arena.recentBids} animateNewest />
          ) : (
            <KingOfTheHill bids={arena.recentBids} urgent={urgency === "suddenDeath"} />
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Border, glow and a hair of scale — cbeave's sudden-death alert, rebuilt on
 * BidNest's own red. `ring-color` rather than `border-color` because the
 * panels use rings, so the pulse lands on the edge that is already there and
 * nothing shifts by a pixel when it starts.
 *
 * `prefers-reduced-motion` is handled by the `motion-safe:` prefix at the call
 * site, so this needs no media query of its own.
 */
const PULSE_KEYFRAMES = `
@keyframes pulse-urgent {
  0%, 100% {
    --tw-ring-color: color-mix(in srgb, var(--color-red) 45%, transparent);
    box-shadow: 0 0 18px color-mix(in srgb, var(--color-red) 12%, transparent);
    transform: scale(1);
  }
  50% {
    --tw-ring-color: var(--color-red);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--color-red) 45%, transparent),
      0 0 56px color-mix(in srgb, var(--color-red) 22%, transparent);
    transform: scale(1.008);
  }
}
`
