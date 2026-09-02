"use client"

import { createContext, use } from "react"
import { useQuery } from "@tanstack/react-query"

import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import {
  countProductWatchlist,
  productWatchlistCountQueryKey,
} from "@/lib/api/product-watchlist"
import {
  auctionWatchlistCountQueryKey,
  countWatchlist,
} from "@/lib/api/watchlist"

type WatchlistContextValue = {
  /** Listings followed. */
  productCount: number
  /** Auctions followed. */
  auctionCount: number
  /** What a single heart in the header should show — both halves together. */
  count: number
  /** False until localStorage has been read; the count is 0 until it is true. */
  isAuthReady: boolean
  /**
   * True once both halves have answered. Until then every count above reads 0,
   * which is indistinguishable from following nothing — so a caller that
   * writes the number down rather than hiding a badge has to wait for this.
   *
   * One flag for both halves on purpose: the two counts are shown side by side
   * to be compared, and a screen that printed one while the other stayed blank
   * would read as "the auctions failed" rather than "still loading".
   */
  isLoaded: boolean
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

/**
 * How many things the viewer follows, for a badge in the header.
 *
 * Counts auctions *and* listings, because the header carries one heart and
 * `/watchlist` shows both under it — a badge that counted only half would
 * disagree with the page it opens.
 *
 * Both halves ask for a count rather than a list.
 *
 * They used to read `meta.total` off `listProductWatchlist({ limit: 100 })`
 * and `listWatchlist({ limit: 100 })` — which is a hundred products with their
 * images and sellers, and a hundred auctions with their countdowns and
 * winners, fetched on every page in the app to render two integers. The hearts
 * on a catalog page need that list and share the key, so on `/shop` it cost
 * nothing extra; everywhere else — `/cart`, `/orders`, `/notifications`, every
 * page with a header and no hearts — it was the whole payload for the number.
 *
 * The badge still moves the moment a heart is pressed, and without either
 * button having to know this exists. `productWatchlistCountQueryKey` is
 * `["product-watchlist", "count"]` — the list key with a segment appended — and
 * `invalidateQueries` matches by prefix, so the `invalidateQueries({ queryKey:
 * productWatchlistQueryKey })` each button runs on settle invalidates the count
 * too. The auction side works the same way. Anything that invalidates the list
 * invalidates the number derived from it, which is the only relationship worth
 * guaranteeing between them.
 *
 * Un-following is the one case that does not wait for that refetch: the buttons
 * write this count down by one in `onMutate`, alongside the list, so the badge
 * and the card it opens onto move together instead of the number lagging a
 * round trip behind the card that vanished.
 */
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuthToken()
  const isAuthenticated = ready && Boolean(token)

  const products = useQuery({
    queryKey: productWatchlistCountQueryKey,
    queryFn: countProductWatchlist,
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  const auctions = useQuery({
    queryKey: auctionWatchlistCountQueryKey,
    queryFn: countWatchlist,
    enabled: isAuthenticated,
    retry: false,
  })

  const productCount = products.data?.total ?? 0
  const auctionCount = auctions.data?.total ?? 0

  const value: WatchlistContextValue = {
    productCount,
    auctionCount,
    count: productCount + auctionCount,
    isAuthReady: ready,
    isLoaded: products.isSuccess && auctions.isSuccess,
  }

  return <WatchlistContext value={value}>{children}</WatchlistContext>
}

export function useWatchlistCount(): WatchlistContextValue {
  const context = use(WatchlistContext)
  if (!context) {
    throw new Error("useWatchlistCount must be used inside <WatchlistProvider>")
  }
  return context
}