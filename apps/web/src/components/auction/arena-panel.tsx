"use client"

import { useCallback, useState } from "react"
import { Users } from "lucide-react"

import { AuctionCountdown } from "@/components/auction/auction-countdown"
import { AuctionResultPanel } from "@/components/auction/auction-result-panel"
import { BidHistoryList } from "@/components/auction/bid-history-list"
import { PlaceBidControl } from "@/components/auction/place-bid-control"
import { SuddenDeathBanner } from "@/components/auction/sudden-death-banner"
import { Badge } from "@/components/ui/badge"
import { getArena } from "@/lib/api/auctions"
import { formatTHB } from "@/lib/format"
import { useAuctionRoom } from "@/lib/use-auction-room"
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

  return (
    <div className="flex flex-col gap-4">
      {suddenDeath.active && !result && (
        <SuddenDeathBanner suddenDeath={suddenDeath} />
      )}

      {result ? (
        <AuctionResultPanel result={result} />
      ) : (
        <section className="rounded-r4 bg-white p-5 shadow-sh1">
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
            <span className="text-sm text-n-500">
              {running ? "เหลือเวลา" : "เริ่มอีก"}
            </span>
            <AuctionCountdown
              msRemaining={
                running ? countdown.msUntilEnd : countdown.msUntilStart
              }
              urgent={suddenDeath.active}
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
          <h2 className="font-display text-lg font-bold text-ink">
            การเสนอราคาล่าสุด
          </h2>
          <span className="text-sm text-n-500">
            ทั้งหมด {auction.bidCount.toLocaleString("th-TH")} ครั้ง
          </span>
        </div>
        <div className="mt-2">
          <BidHistoryList bids={arena.recentBids} animateNewest />
        </div>
      </section>
    </div>
  )
}
