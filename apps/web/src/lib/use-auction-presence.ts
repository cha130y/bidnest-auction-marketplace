"use client"

import { useEffect } from "react"

import { joinAuction, leaveAuction } from "@/lib/api/auctions"

/**
 * How many mounted screens in this tab are holding each auction open.
 *
 * Module level rather than a ref, because the thing being counted outlives any
 * one mount: React runs an effect twice on purpose in development (setup,
 * cleanup, setup), and a screen that re-renders through Fast Refresh does the
 * same. Without this the cleanup of the first mount would send a DELETE that
 * lands after the second mount's POST, and the person watching would be marked
 * absent while still sitting there — the exact bug this hook exists to fix,
 * reappearing only in development, which is where it would be seen most.
 *
 * A second tab has its own copy of this module and its own count, which is
 * right: it is a different connection standing for the same person, and the
 * API already treats joining twice as one participant.
 */
const holders = new Map<string, number>()

function hold(auctionId: string): void {
  holders.set(auctionId, (holders.get(auctionId) ?? 0) + 1)
}

function release(auctionId: string): void {
  const remaining = (holders.get(auctionId) ?? 1) - 1

  if (remaining > 0) holders.set(auctionId, remaining)
  else holders.delete(auctionId)
}

/**
 * LIV-001 — records that this person is taking part, and that they have gone.
 *
 * The participant row is what the lobby and the arena count, and it is written
 * over HTTP rather than by the socket on purpose: joining is the person's own
 * decision, while a socket is only the thing that notices they stopped being
 * here. `auction:join` deliberately does not create the row — see the comment
 * on AuctionGateway.leave — so without this call the count stays at zero no
 * matter how many people are watching.
 *
 * The two halves cover different exits, and both are needed:
 *
 * - Navigating away runs the cleanup below, which marks them LEFT.
 * - Closing the tab runs nothing, and the dropped socket is what marks them
 *   LEFT instead (PresenceRegistry → LiveService.leave).
 *
 * `active` is passed in rather than worked out here: the hook has no arena to
 * read, and the two conditions that matter — being signed in, and the auction
 * still being one of JOINABLE_AUCTION_STATUSES — are both facts the caller
 * already holds.
 */
export function useAuctionPresence(
  auctionId: string,
  active: boolean,
  onChange: () => void
) {
  useEffect(() => {
    if (!active) return

    hold(auctionId)

    let left = false

    /**
     * Resolves to whether the join actually landed, and never rejects.
     *
     * A refusal is not worth showing anybody: 401 is a session that expired
     * between the arena read and this call, and 409 is an auction that
     * finished in the same moment. Neither stops the visitor from watching,
     * which is what they came for.
     */
    const joining = joinAuction(auctionId).then(
      () => {
        // The count that came back is this person's own arrival. Re-reading
        // the arena rather than applying it keeps every number on screen from
        // one moment — the same rule useAuctionRoom follows — and it is also
        // what fills in `you.joined` for the screen.
        if (!left) onChange()
        return true
      },
      () => false
    )

    return () => {
      left = true
      release(auctionId)

      // Chained onto the join rather than fired alongside it. A visitor who
      // leaves before the join has answered would otherwise send the DELETE
      // first, and the POST landing afterwards would leave them counted as
      // present in an auction they are no longer looking at.
      void joining.then((joined) => {
        // Read here rather than in the cleanup itself: a remount happens in
        // the same commit as the unmount, so the new hold exists by the time
        // this microtask runs but not yet when the cleanup was called.
        if (!joined || holders.has(auctionId)) return

        return leaveAuction(auctionId).catch(() => undefined)
      })
    }
  }, [auctionId, active, onChange])
}
