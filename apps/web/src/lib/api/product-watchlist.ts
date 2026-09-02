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

/** The list itself. `productWatchlistCountQueryKey` extends this by a segment,
 * so invalidating this prefix invalidates the count derived from it. */
export const productWatchlistQueryKey = ["product-watchlist"] as const

/**
 * The one description of this query, shared by everything that reads it.
 *
 * Both the hearts and `/watchlist`'s listings tab subscribe under the same key.
 * React Query keeps one entry per key and runs whichever `queryFn` the first
 * observer to mount supplied — so two callers passing the same key with
 * different functions is a bug that shows up only in whichever order they
 * happen to mount. Handing both the same object removes the chance.
 *
 * `limit` is the hearts' 100 rather than the tab's old 24: neither screen
 * paginates, so the larger page is strictly more of the list, and the tab's
 * "ติดตามอยู่ N รายการ" reads `meta.total` from the server either way.
 */
export function productWatchlistQueryOptions() {
  return {
    queryKey: productWatchlistQueryKey,
    queryFn: () => listProductWatchlist({ limit: 100 }),
    // A 401 will not fix itself by trying again
    retry: false,
  }
}