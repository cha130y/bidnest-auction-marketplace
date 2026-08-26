"use client"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  WatchlistProvider,
  useWatchlistCount,
} from "@/components/watchlist/watchlist-provider"

/**
 * WAT-002 — the two tab labels, each carrying how many things sit behind it.
 *
 * The header keeps showing one number for both halves, because it carries one
 * heart. Here there are two tabs and the useful question is which of them the
 * viewer's things are in — a single total would answer it only when one half
 * happened to be empty.
 *
 * A client island rather than a client page: the counts need a token, so they
 * cannot be read while the page around this is server-rendered, and the labels
 * are the only part that needs them.
 *
 * It mounts a `WatchlistProvider` of its own. `AppHeader` has one already, but
 * that one wraps the header rather than the page body. The two share the two
 * count query keys and the same QueryClient, so this asks for nothing extra
 * and the tabs cannot disagree with the heart above them.
 */
export function WatchlistTabsList() {
  return (
    <WatchlistProvider>
      <Labels />
    </WatchlistProvider>
  )
}

function Labels() {
  const { auctionCount, productCount, isLoaded } = useWatchlistCount()

  return (
    <TabsList>
      {/* Auctions first: they are the ones that expire, so they are the ones
          somebody opening this page is more likely to have come for. */}
      <TabsTrigger value="auctions" className="group">
        การประมูล
        <Count value={auctionCount} show={isLoaded} />
      </TabsTrigger>
      <TabsTrigger value="products" className="group">
        สินค้า
        <Count value={productCount} show={isLoaded} />
      </TabsTrigger>
    </TabsList>
  )
}

/**
 * Nothing at all until the number is known, rather than a 0 that turns into a
 * 3: a count is read, not glanced at, and one that changes after the fact is
 * worse than one that arrives late.
 *
 * Grey on the tab that is not open, amber on the one that is. White was the
 * first attempt and it was the wrong colour twice over: the list's track is
 * `n-100`, so a white pill barely separated from it, and the open tab is
 * itself a white pill — two white shapes side by side read as two open tabs.
 *
 * `min-w-6` holds the pill's width at one digit, so the labels do not shuffle
 * sideways when the counts arrive or a tenth thing is followed.
 */
function Count({ value, show }: { value: number; show: boolean }) {
  if (!show) return null

  return (
    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-n-200 px-1.5 py-0.5 text-xs font-bold tabular-nums text-n-600 transition-colors group-data-active:bg-amber-500 group-data-active:text-ink">
      {value.toLocaleString("th-TH")}
    </span>
  )
}