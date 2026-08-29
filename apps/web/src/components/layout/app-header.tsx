"use client"

import { CartProvider } from "@/components/cart/cart-provider"
import { ShopHeader } from "@/components/layout/shop-header"
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider"

/**
 * The header for every page outside the `(shop)` route group.
 *
 * `ShopHeader` is what fills the icons in — cart count, watchlist count, the
 * unread dot — and it reads all three from context that only the shop layout
 * mounted. Every other page therefore rendered `SiteHeader` bare, which meant
 * the same header with all three badges permanently empty: a cart holding four
 * things showed nothing on `/sell`, and a notification that arrived while
 * reading `/auctions` lit no dot. One header that looks identical everywhere
 * and only sometimes tells the truth is worse than one that is plainly
 * different.
 *
 * Bringing the providers along rather than hoisting them to the root layout
 * keeps them off `/login` and `/register`, which have no header at all. Where
 * a page already has a `CartProvider` of its own — the home page's picks
 * section, the watchlist's listings tab — the two share `cartQueryKey` and the
 * same QueryClient, so React Query serves both from one request and they
 * cannot disagree.
 *
 * `(shop)` pages keep using `ShopHeader` directly: their layout mounts both
 * providers above it already, and a second pair would be redundant.
 */
export function AppHeader() {
  return (
    <CartProvider>
      <WatchlistProvider>
        <ShopHeader />
      </WatchlistProvider>
    </CartProvider>
  )
}