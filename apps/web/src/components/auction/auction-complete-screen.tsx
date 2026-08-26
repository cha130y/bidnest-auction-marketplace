"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Crown, Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getArena } from "@/lib/api/auctions"
import { formatDateTime, formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AuctionArena, PublicBid } from "@/lib/api/types"

/** How many places the podium has. Three, like every podium. */
const PODIUM_PLACES = 3

/**
 * LIV-004 / AUC-007 — the result screen, once an auction is over.
 *
 * A page of its own rather than a panel on the auction, because what somebody
 * wants here is different: the arena is for deciding whether to bid, and this
 * is for finding out how it went. The auction page keeps its own result
 * summary for anyone arriving at a finished auction later — this is where the
 * people who were in the room when it closed are sent.
 *
 * Client-side because of one field. `isYours` on a bid is answered per viewer,
 * and a page rendered on the server has no token to be answered about
 * (`authHeader()` is empty there), so the server's copy always says false. The
 * screen paints immediately from what the server rendered, then re-reads with
 * the token to find out whether the winner is the person looking — the one
 * thing here worth a round trip.
 */
export function AuctionCompleteScreen({
  auctionId,
  initialArena,
}: {
  auctionId: string
  initialArena: AuctionArena
}) {
  const [arena, setArena] = useState(initialArena)

  useEffect(() => {
    let cancelled = false

    getArena(auctionId)
      .then((fresh) => {
        if (!cancelled) setArena(fresh)
      })
      .catch(() => {
        // The server already rendered a correct result; all this read adds is
        // whose it is. Failing to get that is not worth an error where the
        // result was.
      })

    return () => {
      cancelled = true
    }
  }, [auctionId])

  const { auction, result } = arena

  // The page guarantees this — it sends an unfinished auction back to the
  // arena — so this is a type narrowing, not a state anybody sees.
  if (!result) return null

  const sold = result.outcome === "SOLD"
  const youWon = result.winner?.isYours === true

  /**
   * The podium, in bid order.
   *
   * `recentBids` arrives newest first, and in an ascending auction newest is
   * highest — so the top of that list is the ranking, with no second endpoint
   * to ask for it. It is a podium of *bids*: somebody who bid three times
   * holds three places, which is what cbeave shows too. Folding them together
   * is not on offer, because the API masks names (`e***m`) and two different
   * people can mask to the same string — merging by name could put two
   * strangers on one step.
   */
  const podium = arena.recentBids.slice(0, PODIUM_PLACES)

  return (
    <section className="relative mt-8 overflow-hidden rounded-r4 bg-white px-6 py-10 text-center shadow-sh1 md:px-10">
      <style>{CONFETTI_KEYFRAMES}</style>
      {sold && <Confetti />}

      <div className="relative">
        <Trophy
          className={cn(
            "mx-auto size-12",
            sold ? "text-amber-500" : "text-n-400"
          )}
          aria-hidden="true"
        />

        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          ปิดการประมูลแล้ว
        </h1>

        <p
          className={cn(
            "mt-2 font-display text-xl font-bold",
            sold ? "text-amber-600" : "text-n-500"
          )}
        >
          {sold ? (youWon ? "คุณคือผู้ชนะ" : "ได้ผู้ชนะแล้ว") : "ไม่มีผู้ชนะ"}
        </p>

        <p className="mt-2 text-sm text-n-600">
          {sold && result.winner
            ? `${result.winner.isYours ? "คุณ" : result.winner.bidder} ชนะการประมูล ${auction.title}`
            : result.bidCount > 0
              ? "มีผู้เสนอราคาแต่ยังไม่ถึงราคาขั้นต่ำที่ผู้ขายรับได้"
              : "ไม่มีผู้เสนอราคาจนกระทั่งหมดเวลา"}
        </p>

        {podium.length > 0 && <Podium bids={podium} sold={sold} />}

        <dl className="mt-10 grid gap-3 text-left sm:grid-cols-3">
          <Stat
            label={sold ? "ราคาปิด" : "ราคาสูงสุดที่ไปถึง"}
            value={
              sold
                ? formatTHB(result.soldPrice ?? "0")
                : result.finalPrice
                  ? formatTHB(result.finalPrice)
                  : "—"
            }
            emphasis={sold}
          />
          <Stat
            label="จำนวนการเสนอราคา"
            value={`${result.bidCount.toLocaleString("th-TH")} ครั้ง`}
          />
          <Stat
            label="จบเมื่อ"
            value={result.endedAt ? formatDateTime(result.endedAt) : "—"}
          />
        </dl>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            variant="primary"
            size="lg"
            nativeButton={false}
            render={<Link href="/auctions" />}
          >
            ดูการประมูลอื่น
          </Button>
          <Button
            variant="secondary"
            size="lg"
            nativeButton={false}
            render={<Link href={`/auctions/${auctionId}`} />}
          >
            กลับไปหน้าประมูลนี้
          </Button>
        </div>
      </div>
    </section>
  )
}

/**
 * Second place on the left, first in the middle, third on the right — the
 * arrangement everybody reads without a legend, and the reason the order here
 * is not simply 1, 2, 3.
 *
 * Each step says its own rank, rather than leaving the ranking to the layout:
 * a screen reader goes through them in DOM order, which is left to right.
 */
function Podium({ bids, sold }: { bids: PublicBid[]; sold: boolean }) {
  // [2nd, 1st, 3rd], minus the places this auction never filled
  const arrangement = [1, 0, 2].filter((place) => place < bids.length)

  return (
    <ol className="mt-10 flex items-end justify-center gap-3 md:gap-5">
      {arrangement.map((place) => {
        const bid = bids[place]
        const isWinner = place === 0 && sold

        return (
          <li
            key={bid.id}
            className="flex w-24 flex-col items-center md:w-32"
            aria-label={`อันดับ ${place + 1}`}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 items-center justify-center rounded-full font-display text-sm font-bold",
                place === 0
                  ? "bg-amber-500 text-ink"
                  : place === 1
                    ? "bg-n-300 text-n-700"
                    : "bg-amber-200 text-n-700"
              )}
            >
              {bid.bidder.charAt(0).toUpperCase()}
            </span>

            {isWinner && (
              <Crown className="mt-1 size-4 text-amber-500" aria-hidden="true" />
            )}

            <span
              className={cn(
                "mt-1 max-w-full truncate text-xs",
                bid.isYours ? "font-bold text-amber-600" : "text-n-600"
              )}
            >
              {bid.isYours ? "คุณ" : bid.bidder}
            </span>
            <span className="font-display text-sm font-bold text-ink tabular-nums">
              {formatTHB(bid.amount)}
            </span>

            {/**
             * The step itself, which grows out of the floor on arrival — the
             * one flourish this page gets. `motion-safe:` because somebody who
             * asked for reduced motion asked to be spared exactly this.
             *
             * The delay runs first, second, third rather than left to right,
             * so the winner's step lands first.
             */}
            <div
              className={cn(
                "mt-2 w-full rounded-t-r2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 motion-safe:fill-mode-backwards motion-safe:duration-700",
                place === 0
                  ? "h-24 bg-amber-500 md:h-28"
                  : place === 1
                    ? "h-16 bg-n-300 md:h-20"
                    : "h-11 bg-amber-200 md:h-14"
              )}
              style={{ animationDelay: `${place * 140}ms` }}
            >
              <span className="mt-2 block font-display text-lg font-extrabold text-ink/70">
                {place + 1}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-r3 bg-n-100 px-4 py-3">
      <dt className="text-[10px] font-bold tracking-[0.14em] text-n-500 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-display font-bold text-ink tabular-nums",
          emphasis ? "text-xl" : "text-base"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

const CONFETTI_COLORS = [
  "var(--color-amber-500)",
  "var(--color-amber-400)",
  "var(--color-amber-200)",
  "var(--color-red)",
  "var(--color-n-300)",
]

/**
 * Confetti, in CSS.
 *
 * Every piece is placed and timed from its index rather than from
 * `Math.random()`, which matters for something the server renders first:
 * random values would differ between the server's HTML and the browser's first
 * render, and React would report a hydration mismatch over pure decoration.
 *
 * The stride of 37 shares no factor with 32, so the pieces spread across the
 * width instead of stacking into a few columns.
 */
const CONFETTI_PIECES = Array.from({ length: 32 }, (_, index) => ({
  left: (index * 37) % 100,
  /**
   * Negative on every other piece, which is what keeps the fall from arriving
   * in waves: a negative delay starts the animation part-way through, so those
   * pieces are already mid-air on the first frame and never line up with the
   * ones that start at the top.
   */
  delay: (index % 2 === 0 ? -1 : 1) * (((index * 13) % 34) / 10),
  // Spread wide (3.4s–6.8s) so the loops drift apart instead of resyncing
  duration: 3.4 + ((index * 7) % 35) / 10,
  drift: ((index % 5) - 2) * 24,
  size: 5 + (index % 3) * 3,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
}))

/**
 * Falls for as long as the page is open.
 *
 * `motion-safe:` carries the weight here: a loop is exactly what
 * `prefers-reduced-motion` is for, and without the prefix these pieces would
 * hang at the top of the card forever for anybody who set it.
 */
function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {CONFETTI_PIECES.map((piece, index) => (
        <span
          key={index}
          className="absolute top-0 block rounded-[2px] opacity-0 motion-safe:animate-[confetti-fall_var(--fall-duration)_linear_var(--fall-delay)_infinite]"
          style={
            {
              left: `${piece.left}%`,
              width: `${piece.size}px`,
              height: `${piece.size * 2}px`,
              background: piece.color,
              "--fall-duration": `${piece.duration}s`,
              "--fall-delay": `${piece.delay}s`,
              "--fall-drift": `${piece.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/**
 * Defined here rather than in `app/globals.css`, for the reason `arena-panel`
 * gives about its own keyframes: that file is Dev 1's, generated from the
 * Figma export, and anything added to it disappears on the next re-export
 * without breaking a build.
 */
const CONFETTI_KEYFRAMES = `
@keyframes confetti-fall {
  0% {
    transform: translate3d(0, -24px, 0) rotate(0deg);
    opacity: 0;
  }
  6% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--fall-drift), 780px, 0) rotate(600deg);
    opacity: 0;
  }
}
`
