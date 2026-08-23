import { Crown } from "lucide-react"

import { formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PublicBid } from "@/lib/api/types"

const MEDALS = ["🥇", "🥈", "🥉"]

/**
 * The bidding, ranked — which for an ascending auction is the same list as the
 * bidding in reverse order of arrival, because a bid that is later is a bid
 * that is higher. That is exactly what cbeave does, and it is why this needs
 * no ranking endpoint: `recentBids` already arrives newest first.
 *
 * One consequence worth knowing rather than hiding: a person who bid twice
 * appears twice, holding two places. This is a list of *bids* wearing medals,
 * not a table of bidders. Deduplicating is not on offer — the API masks names
 * (`e***m`), and two different people can mask to the same string, so folding
 * rows together by name could merge two strangers into one.
 */
export function KingOfTheHill({
  bids,
  urgent = false,
}: {
  bids: PublicBid[]
  /** LIV-003 — tints the leading row while the deadline is live. */
  urgent?: boolean
}) {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-n-500 uppercase">
        <Crown className="size-3.5 text-amber-500" />
        ผู้นำการประมูล
      </h2>

      {bids.length === 0 ? (
        <p className="mt-2 rounded-r3 border border-dashed border-n-300 px-4 py-6 text-center text-sm text-n-500">
          ยังไม่มีผู้เสนอราคา
        </p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {bids.map((bid, index) => {
            const leading = index === 0

            return (
              <li
                key={bid.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-r3 px-3 py-2.5 ring-1",
                  leading && urgent
                    ? "bg-red-50 ring-red"
                    : leading
                      ? "bg-amber-50 ring-amber-200"
                      : "bg-white ring-n-200"
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-n-500">
                    {MEDALS[index] ?? `#${index + 1}`}
                  </span>

                  {/* The masked name is all there is to work with, so the
                      avatar is its first character rather than a real one. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      bid.isYours
                        ? "bg-amber-500 text-ink"
                        : "bg-n-200 text-n-600"
                    )}
                  >
                    {bid.bidder.charAt(0).toUpperCase()}
                  </span>

                  <span
                    className={cn(
                      "truncate text-sm",
                      bid.isYours
                        ? "font-semibold text-amber-600"
                        : "text-ink"
                    )}
                  >
                    {bid.isYours ? "คุณ" : bid.bidder}
                  </span>

                  {leading && (
                    <Crown className="size-3.5 shrink-0 text-amber-500" />
                  )}
                </div>

                <span
                  className={cn(
                    "shrink-0 font-display text-sm font-bold tabular-nums",
                    leading && urgent ? "text-red" : "text-ink"
                  )}
                >
                  {formatTHB(bid.amount)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
