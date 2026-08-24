import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  Paginated,
  ProductWatchToggle,
  ProductWatchlistEntry,
} from "@/lib/api/types"

/**
 * Follows a listing. Needs a token.
 *
 * Idempotent: following something already followed returns the original
 * `watchedAt` rather than re-stamping it or failing, so a double click costs
 * nothing.
 */
export function watchProduct(productId: string) {
  return apiFetch<ProductWatchToggle>(`/products/${productId}/watchlist`, {
    method: "POST",
  })
}

/** Stops following. Returns `removed: false` if it was not followed. */
export function unwatchProduct(productId: string) {
  return apiFetch<ProductWatchToggle>(`/products/${productId}/watchlist`, {
    method: "DELETE",
  })
}

export type ProductWatchlistParams = {
  page?: number
  limit?: number
}

/**
 * Every listing the viewer follows, newest first.
 *
 * A listing the seller paused, or an admin took down, is not in it — the API
 * drops those rather than returning a row that opens onto a 404.
 *
 * Needs a token, which is why nothing calls this during SSR: `authHeader()` is
 * empty on the server, so it would 401 every time.
 */
export function listProductWatchlist(params: ProductWatchlistParams = {}) {
  return apiFetch<Paginated<ProductWatchlistEntry>>(
    `/watchlist/products${buildQuery({ ...params })}`
  )
}