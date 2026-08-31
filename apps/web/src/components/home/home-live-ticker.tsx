import { ArrowUp } from "lucide-react"

import { listAuctions } from "@/lib/api/auctions"
import { formatTHB } from "@/lib/format"

/**
 * How many auctions the strip asks for. The marquee is decoration, not a
 * list to read through — six is enough to fill a wide screen once and keeps
 * the read small.
 */
const TICKER_LIMIT = 6

/**
 * The shortest strip worth animating. Below this the copies are repeated
 * until the row is at least this long, because `animate-marquee` scrolls by
 * exactly -50% and a half narrower than the viewport leaves a visible gap
 * sliding past on every loop.
 */
const MIN_TICKER_ITEMS = 6

function TickerItem({ title, price }: { title: string; price: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-6 text-sm font-semibold whitespace-nowrap text-n-300">
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="text-white">{title}</span>
      <span className="flex items-center gap-0.5 font-extrabold text-amber-400">
        <ArrowUp className="size-3" />
        {formatTHB(price)}
      </span>
    </div>
  )
}

/**
 * Home page, above the hero — a "bidding is happening right now" cue, and it
 * has to be true: these are the live auctions (AUC-008's hot list), at the
 * price they are actually standing at.
 *
 * An `async` Server Component behind its own `<Suspense>` in `page.tsx`, the
 * same shape as `HomeHeroSpotlight`, so a slow read holds up this strip and
 * nothing else on the page.
 *
 * Renders nothing at all when there is nothing running, or when the read
 * fails. A strip that says "bidding is happening" over an empty row, or over
 * yesterday's prices, is worse than no strip: the whole point of it is that
 * what it shows is happening now.
 */
export async function HomeLiveTicker() {
  let items: { title: string; price: string }[]

  try {
    const page = await listAuctions({ section: "hot", limit: TICKER_LIMIT })
    items = page.items.map((auction) => ({
      title: auction.title,
      // The same rule the cards use: before the first bid the starting price
      // is the price, and `currentPrice` is not it.
      price:
        auction.bidCount === 0 ? auction.startingPrice : auction.currentPrice,
    }))
  } catch {
    return null
  }

  if (items.length === 0) return null

  // One lap of the animation is two identical halves; each half repeats the
  // auctions until it is wide enough to cover the screen on its own.
  const lap = Array.from(
    { length: Math.ceil(MIN_TICKER_ITEMS / items.length) },
    () => items
  ).flat()

  return (
    <div className="overflow-hidden bg-ink py-2.5">
      <div className="flex w-max animate-marquee">
        {[...lap, ...lap].map((item, index) => (
          <TickerItem key={index} title={item.title} price={item.price} />
        ))}
      </div>
    </div>
  )
}

/**
 * Holds the strip's height while it loads, so the hero underneath does not
 * jump up and then back down. `py-2.5` around one line of `text-sm` is 40px,
 * which is what `h-10` is.
 */
export function HomeLiveTickerFallback() {
  return <div className="h-10 bg-ink" />
}
