"use client"

import { createContext, use } from "react"
import { useQuery } from "@tanstack/react-query"

import { productWatchlistQueryKey } from "@/components/shop/product-watch-button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { listProductWatchlist } from "@/lib/api/product-watchlist"
import { listWatchlist } from "@/lib/api/watchlist"

export const auctionWatchlistQueryKey = ["auction-watchlist"] as const

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
 * The listings half is free: it reuses `productWatchlistQueryKey`, the key
 * every heart on every card already reads, so React Query serves it from the
 * same fetch rather than making a second one. That shared key is also what
 * makes the badge move the moment a heart is pressed — following a listing
 * invalidates the key, both this and the card re-read it, and they cannot
 * drift apart.
 *
 * The auctions half is shared the same way since WAT-001 landed: the auction
 * side's `WatchButton` reads `auctionWatchlistQueryKey` with the same
 * `listWatchlist({ limit: 100 })` this does, so the two are one request and
 * one answer. (It used to fetch through `useEffect`, which is why this note
 * once said there was nothing to share with.)
 */
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuthToken()
  const isAuthenticated = ready && Boolean(token)

  const products = useQuery({
    queryKey: productWatchlistQueryKey,
    queryFn: () => listProductWatchlist({ limit: 100 }),
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  const auctions = useQuery({
    queryKey: auctionWatchlistQueryKey,
    queryFn: () => listWatchlist({ limit: 100 }),
    enabled: isAuthenticated,
    retry: false,
  })

  // `meta.total` rather than `items.length`: the total is the whole list, and
  // the request only ever asks for the first page of it.
  const productCount = products.data?.meta.total ?? 0
  const auctionCount = auctions.data?.meta.total ?? 0

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