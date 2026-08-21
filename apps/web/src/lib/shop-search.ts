import { buildQuery } from "@/lib/api/client"
import type { ProductSort } from "@/lib/api/types"

export const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "ใหม่ล่าสุด" },
  { value: "price_asc", label: "ราคา: ต่ำ → สูง" },
  { value: "price_desc", label: "ราคา: สูง → ต่ำ" },
]

export const CATALOG_PAGE_SIZE = 12

/**
 * The catalog keeps its filter state in the URL, not in React state: the page
 * is a Server Component, and a shareable/back-button-able URL is what
 * `SearchProductDto` already expects anyway.
 */
export type ShopSearch = {
  q?: string
  categoryIds: string[]
  minPrice?: number
  maxPrice?: number
  sort?: ProductSort
  page: number
}

export type RawSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const raw = first(value)
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  // Reject junk here so the API never has to 400 on a hand-edited URL
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function parseShopSearch(params: RawSearchParams): ShopSearch {
  const sort = first(params.sort)
  const page = toNumber(params.page)

  const rawCategories = params.categoryIds
  const categoryIds = (
    Array.isArray(rawCategories) ? rawCategories : rawCategories?.split(",")
  )
    ?.map((id) => id.trim())
    .filter(Boolean)

  return {
    q: first(params.q),
    categoryIds: categoryIds ?? [],
    minPrice: toNumber(params.minPrice),
    maxPrice: toNumber(params.maxPrice),
    sort: PRODUCT_SORTS.some((option) => option.value === sort)
      ? (sort as ProductSort)
      : undefined,
    page: page && page >= 1 ? Math.floor(page) : 1,
  }
}

/**
 * Builds the next catalog URL. Any change other than paging resets to page 1,
 * because page 5 of the previous filter rarely exists under the new one.
 */
export function shopHref(
  current: ShopSearch,
  overrides: Partial<ShopSearch> = {}
): string {
  const next = { ...current, ...overrides }
  const page = "page" in overrides ? next.page : 1

  return `/shop${buildQuery({
    q: next.q,
    categoryIds: next.categoryIds,
    minPrice: next.minPrice,
    maxPrice: next.maxPrice,
    sort: next.sort,
    page: page > 1 ? page : undefined,
  })}`
}
