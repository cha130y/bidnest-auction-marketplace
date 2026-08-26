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

/**
 * How many, without any of them.
 *
 * For the badge in the header, which is on every page and wants an integer,
 * not a page of products with their images and sellers attached.
 *
 * Counts exactly what `listProductWatchlist` would list — same filter,
 * server-side — so the number cannot promise more than the page it opens can
 * show.
 */
export function countProductWatchlist() {
  return apiFetch<{ total: number }>("/watchlist/products/count")
}

/**
 * Kept here, next to the fetch, rather than in the provider that reads it.
 *
 * `watchlist-provider` already imports this module, and `ProductWatchButton`
 * — which has to invalidate this key when a heart is pressed — imports it too.
 * Declaring the key in either component would make the two import each other.
 */
export const productWatchlistCountQueryKey = [
  "product-watchlist",
  "count",
] as const