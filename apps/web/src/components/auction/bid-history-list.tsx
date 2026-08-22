import { formatDateTime, formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PublicBid } from "@/lib/api/types"

/**
 * BID-005 — the bids, newest first, as the arena hands them over.
 *
 * `bidder` is rendered exactly as the API sent it. The masking happens there,
 * identically in the history, the arena and the broadcast, so one person reads
 * as one person wherever they appear — and there is no unmasked name here to
 * fall back to if this tried to be clever.
 *
 * `isYours` is the API's answer too, not a comparison against a local user id:
 * it is computed against the token that made the request, so it stays right
 * for a signed-out visitor (always false) without this component knowing who
 * is signed in.
 */
export function BidHistoryList({
  bids,
  emptyMessage = "ยังไม่มีผู้เสนอราคา",
  animateNewest = false,
}: {
  bids: PublicBid[]
  emptyMessage?: string
  /**
   * LIV-005 — slides the top row in when a new bid arrives, so a list somebody
   * is watching shows that it grew rather than silently being longer.
   *
   * Off by default: on a paged history every row is "new" on arrival, and
   * animating all of them would be noise.
   */
  animateNewest?: boolean
}) {
  if (bids.length === 0) {
    return (
      <p className="rounded-r3 bg-n-100 px-4 py-8 text-center text-sm text-n-500">
        {emptyMessage}
      </p>
    )
  }

  return (
    <ol className="divide-y divide-n-200">
      {bids.map((bid, index) => (
        <li
          key={bid.id}
          className={cn(
            "flex items-center justify-between gap-3 py-3",
            // Keyed by id already, so a genuinely new row mounts and plays
            // this once; the rows below it are untouched and stay put.
            animateNewest &&
              index === 0 &&
              "motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:fade-in motion-safe:duration-300"
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm font-medium",
                bid.isYours ? "text-amber-600" : "text-ink"
              )}
            >
              {bid.isYours ? "คุณ" : bid.bidder}
              {/* The newest row is the one that would win right now, which is
                  worth saying on a list people scan from the top */}
              {index === 0 && (
                <span className="ml-2 text-xs font-normal text-n-500">
                  ล่าสุด
                </span>
              )}
            </p>
            <p className="text-xs text-n-500">{formatDateTime(bid.placedAt)}</p>
          </div>
          <span className="shrink-0 font-display text-sm font-bold text-ink tabular-nums">
            {formatTHB(bid.amount)}
          </span>
        </li>
      ))}
    </ol>
  )
}
