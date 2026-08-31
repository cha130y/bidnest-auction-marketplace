import { Gavel, ShoppingBag, TrendingUp } from "lucide-react"

import { getAuctionStats } from "@/lib/api/auctions"
import { formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The three headline numbers under the hero.
 *
 * This strip used to carry invented counts — 340+ auctions, 1,850+ listings,
 * 210+ verified sellers — standing in until there was real data. These are
 * the real ones, from `GET /auctions/stats`, which counts them in the
 * database rather than adding up a page of the list.
 *
 * Each number answers a different question, which is why these three and not
 * three sizes of the same thing: what is running now, how much bidding this
 * place actually sees, and what the last real sale went for. The count of
 * listings is deliberately not here — it is the slowest number in the system
 * to move, so it is the one that sits at a single digit longest.
 *
 * `async` behind its own `<Suspense>` in `page.tsx`, like the ticker and the
 * hero spotlight.
 */
export async function HomeStatsStrip() {
  let stats: Awaited<ReturnType<typeof getAuctionStats>>

  try {
    stats = await getAuctionStats()
  } catch {
    // Same rule as the ticker: the true thing or nothing. A strip of zeroes
    // because a read failed would be a claim about the marketplace rather
    // than a report of one.
    return null
  }

  const cells = [
    {
      icon: Gavel,
      value: stats.activeAuctions.toLocaleString("th-TH"),
      label: "ประมูลที่กำลังดำเนินอยู่",
    },
    {
      icon: TrendingUp,
      value: stats.totalBids.toLocaleString("th-TH"),
      label: "ครั้งที่มีคนเสนอราคา",
    },
    // Dropped rather than rendered empty until somebody sells something. Two
    // columns is a layout; a column reading "—" is a gap with a label on it.
    ...(stats.lastSale
      ? [
          {
            icon: ShoppingBag,
            value: formatTHB(stats.lastSale.soldPrice),
            label: `ดีลล่าสุด · ${stats.lastSale.title}`,
          },
        ]
      : []),
  ]

  // Nothing running, nobody has bid and nothing has sold — a brand new
  // deployment. Three zeroes say less than no strip at all.
  if (stats.activeAuctions === 0 && stats.totalBids === 0 && !stats.lastSale) {
    return null
  }

  return (
    <div
      className={cn(
        "my-8 grid grid-cols-1 divide-y divide-white/10 overflow-hidden rounded-r4 bg-linear-to-b from-[#2b303b] to-ink shadow-sh2 sm:divide-x sm:divide-y-0",
        cells.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
      )}
    >
      {cells.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex items-center gap-3 px-6 py-6">
          <Icon className="size-6 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <div className="font-display text-2xl font-extrabold text-amber-400 tabular-nums">
              {value}
            </div>
            {/* A sold item's title is whatever the seller typed, so it is the
                one label here that can run long. */}
            <div className="truncate text-xs font-semibold text-n-300">
              {label}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Holds the strip's height while it loads. Matches the rendered card: `py-6`
 * around a 2xl number over a 12px label, plus the `my-8` around it.
 */
export function HomeStatsStripFallback() {
  return <div className="my-8 h-23 animate-pulse rounded-r4 bg-n-200" />
}
