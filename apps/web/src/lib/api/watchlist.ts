import { apiFetch, buildQuery } from "@/lib/api/client"
import type { Paginated, WatchlistEntry, WatchToggle } from "@/lib/api/types"

/**
 * WAT-001 — follows an auction. Needs a token.
 *
 * Idempotent: watching something already watched returns the original
 * `watchedAt` rather than re-stamping it or failing, so a double click costs
 * nothing.
 */
export function watchAuction(auctionId: string) {
  return apiFetch<WatchToggle>(`/auctions/${auctionId}/watchlist`, {
    method: "POST",
  })
}

/** WAT-001 — stops following. Returns `removed: false` if it was not followed. */
export function unwatchAuction(auctionId: string) {
  return apiFetch<WatchToggle>(`/auctions/${auctionId}/watchlist`, {
    method: "DELETE",
  })
}

export type WatchlistParams = {
  page?: number
  limit?: number
}

/**
 * WAT-002 — everything the viewer is following, newest first.
 *
 * Needs a token, which is why nothing calls this during SSR: `authHeader()` is
 * empty on the server, so it would 401 every time.
 */
export function listWatchlist(params: WatchlistParams = {}) {
  return apiFetch<Paginated<WatchlistEntry>>(
    `/watchlist${buildQuery({ ...params })}`
  )
}

/**
 * WAT-002 — how many, without any of them.
 *
 * For the badge in the header, which is on every page and wants an integer,
 * not a page of auctions with their countdowns and winners attached.
 *
 * Counts exactly what `listWatchlist` would list — same filter, server-side —
 * so the number cannot promise more than the page it opens can show.
 */
export function countWatchlist() {
  return apiFetch<{ total: number }>("/watchlist/count")
}

/**
 * Kept here, next to the fetch, rather than in the provider that reads it.
 *
 * `watchlist-provider` already imports this module, and the auction
 * `WatchButton` — which has to invalidate this key when a heart is pressed —
 * imports it too. Declaring the key in either component would make the two
 * import each other.
 */
export const auctionWatchlistCountQueryKey = ["auction-watchlist", "count"] as const

/** The list itself. `auctionWatchlistCountQueryKey` extends this by a segment,
 * so invalidating this prefix invalidates the count derived from it. */
export const auctionWatchlistQueryKey = ["auction-watchlist"] as const

/**
 * The one description of this query, shared by everything that reads it.
 *
 * Both the hearts and `/watchlist`'s auctions tab subscribe under the same key.
 * React Query keeps one entry per key and runs whichever `queryFn` the first
 * observer to mount supplied — so two callers passing the same key with
 * different functions is a bug that shows up only in whichever order they
 * happen to mount. Handing both the same object removes the chance.
 *
 * `limit` is the hearts' 100 rather than the tab's old 24: neither screen
 * paginates, so the larger page is strictly more of the list, and the tab's
 * "ติดตามอยู่ N รายการ" reads `meta.total` from the server either way.
 */
export function auctionWatchlistQueryOptions() {
  return {
    queryKey: auctionWatchlistQueryKey,
    queryFn: () => listWatchlist({ limit: 100 }),
    // A 401 will not fix itself by trying again
    retry: false,
  }
}
