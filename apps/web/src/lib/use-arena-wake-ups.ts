"use client"

import { useEffect } from "react"

import type { AuctionArena } from "@/lib/api/types"

/**
 * How long to wait before asking again when the clock says a transition is due
 * but the arena has not caught up with it yet.
 *
 * Two things can leave a screen in that state. A SCHEDULED auction opens on
 * AuctionLifecycleService's pass, which runs every ten seconds, so there is a
 * window where its start time has passed and its status has not changed. And a
 * settlement that another reader won leaves `findPublicAuction` returning the
 * copy it read before the write — see the `isDue` branch there — so this
 * screen can be told the auction is still ACTIVE with no time left on it.
 *
 * Both resolve themselves within about ten seconds, so this costs two or three
 * reads at most, and only ever on an auction that is mid-transition.
 */
const TRANSITION_RECHECK_MS = 3_000

/**
 * Added to every deadline-derived wake-up.
 *
 * The delays here are measured from `msUntil…`, which the server calculated
 * before the response travelled back, so a timer built from them already fires
 * fractionally late — but "already" is not "certainly", and a wake-up that
 * lands a millisecond early reads the same state again and learns nothing. A
 * quarter of a second is imperceptible and removes the question.
 */
const EDGE_BUFFER_MS = 250

/**
 * LIV-003 / LIV-005 — when this screen next has to ask the server something,
 * or null when nothing can change without an event.
 *
 * The arena's urgent states are decided by the API and arrive as answers, not
 * as rules: `suddenDeath.active` is true or false as of the moment the read
 * was served. Everything that *moves* an auction — a bid, an extension, a
 * settlement — is broadcast into the room, so the screen keeps up by itself.
 * Time passing is the one thing that changes the answer and belongs to nobody:
 * an auction that quietly crosses into its closing window emits nothing,
 * because nothing happened. Without this, the amber panel only appears when
 * somebody else bids, or when the visitor reloads the page.
 *
 * A pure function over the arena, so the rule is readable in one place instead
 * of being spread across timers.
 */
export function nextArenaWakeUp(arena: AuctionArena): number | null {
  const { auction, countdown, suddenDeath, result } = arena

  // LIV-004 — a result is final. Nothing later supersedes it, so there is
  // nothing left to wait for.
  if (result) return null

  if (auction.status === "SCHEDULED") {
    // The lobby has to turn into the arena on its own when the clock runs out.
    // `auction:started` says so too, and this is the belt to that pair of
    // braces — it also covers the gap before the lifecycle pass gets to it.
    return countdown.msUntilStart > 0
      ? countdown.msUntilStart + EDGE_BUFFER_MS
      : TRANSITION_RECHECK_MS
  }

  if (auction.status !== "ACTIVE") return null

  // Out of time, but still reading as open: ask again until the settlement
  // this read may well have triggered comes back as a result.
  if (countdown.msUntilEnd === 0) return TRANSITION_RECHECK_MS

  /**
   * The moment the closing window opens, which is the one this whole file
   * exists for. `windowMs` is BID-004's own number, sent by the API — the
   * frontend must not decide for itself what "nearly over" means, or it will
   * shade a countdown the server would still accept an unextended bid on.
   */
  if (!suddenDeath.active) {
    const untilWindow = countdown.msUntilEnd - suddenDeath.windowMs

    if (untilWindow > 0) return untilWindow + EDGE_BUFFER_MS
  }

  // Otherwise the deadline itself. A bid that extends it arrives as an event
  // and re-seeds this from the new deadline.
  return countdown.msUntilEnd + EDGE_BUFFER_MS
}

/**
 * Keeps an arena honest about the things no event announces.
 *
 * Re-reads rather than deriving anything locally, exactly as `useAuctionRoom`
 * does and for the same reason: price, leader, minimum next bid, deadline and
 * urgency have to describe one moment, and the API is what computes them
 * together.
 *
 * Both wake-ups are here because both are the same failure — a screen showing
 * an auction as it was some time ago:
 *
 * - The timer covers time simply passing.
 * - `visibilitychange` covers a tab that was in the background, where browsers
 *   throttle timers to once a minute or stop them altogether. Coming back to a
 *   tab is exactly when somebody looks at the price, and it should not be the
 *   moment they see a stale one.
 */
export function useArenaWakeUps(arena: AuctionArena, onWake: () => void) {
  useEffect(() => {
    const delay = nextArenaWakeUp(arena)

    // Null means the auction has finished: no timer, and no reason to re-read
    // when the tab comes back either.
    if (delay === null) return

    const timer = window.setTimeout(onWake, delay)

    const onVisible = () => {
      if (document.visibilityState === "visible") onWake()
    }

    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // `arena` is replaced by every read, which is what re-arms the timer from
    // the newest deadline — including one anti-sniping just moved.
  }, [arena, onWake])
}
