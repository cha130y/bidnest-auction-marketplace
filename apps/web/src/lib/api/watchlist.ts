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
