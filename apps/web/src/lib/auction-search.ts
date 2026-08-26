import { buildQuery } from "@/lib/api/client"
import type { AuctionSection } from "@/lib/api/types"

/**
 * The four sections, in the order the home page lays them out, with the labels
 * the tab strip shows. Mirrors AUCTION_SECTIONS in the API — the names are the
 * contract, so they are written out rather than derived.
 */
export const AUCTION_SECTION_TABS: {
  value: AuctionSection
  label: string
}[] = [
  { value: "hot", label: "ยอดนิยม" },
  { value: "ending-soon", label: "ปิดเร็วๆ นี้" },
  { value: "starting-soon", label: "กำลังจะเริ่ม" },
  { value: "recently-ended", label: "ผลล่าสุด" },
]

export const AUCTION_PAGE_SIZE = 12

/**
 * The list keeps its state in the URL rather than in React state, the same way
 * the catalog does: the page is a Server Component, and a shareable,
 * back-button-able URL is what the API's own query already expects.
 */
export type AuctionSearch = {
  section: AuctionSection
  /**
   * AUC-008 — the four filters, named exactly as `ShopSearch` names them.
   *
   * Not because anything is shared at runtime, but because the same panel
   * draws both: `FilterValues` is what `components/filters/filter-panel` hands
   * back, and a name that drifted here would need translating on the way in
   * and on the way out.
   *
   * There is no `sort`, which is the one place the two lists differ. The
   * catalog sorts; an auction list is a *section*, and each section carries
   * its own order — a filter may only remove rows from what the section chose.
   */
  q?: string
  categoryIds: string[]
  minPrice?: number
  maxPrice?: number
  page: number
}

export type RawAuctionSearchParams = Record<
  string,
  string | string[] | undefined
>

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * The same shape `@IsUUID('4')` on `ListAuctionsDto` will accept.
 *
 * Checked here so a hand-edited URL cannot reach the API at all. Every id in
 * this parameter was put there by a checkbox, so anything malformed is a typed
 * address — and without this the visitor got a red box quoting a validation
 * message and asking whether the API was running, over a URL they mistyped.
 */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string) => UUID_V4.test(value)

function toNumber(value: string | string[] | undefined): number | undefined {
  const raw = first(value)
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  // Junk is dropped here so the API never has to 400 on a hand-edited URL
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/**
 * A section name that is not one of the four falls back to `hot` here.
 *
 * That is deliberately the opposite of what the API does, and the two are not
 * in conflict. The API refuses an unknown section because a *program* asking
 * for one has a bug worth surfacing. This normalises a *hand-edited URL*, where
 * the visitor is not a program and a page of results beats an error — and it
 * means the API never has to answer for the junk in the first place.
 */
export function parseAuctionSearch(
  params: RawAuctionSearchParams
): AuctionSearch {
  const section = first(params.section)
  const rawPage = Number(first(params.page))

  // Both forms, because `buildQuery` writes the comma one and a hand-written
  // or older URL may repeat the key — the API's own DTO accepts either
  const rawCategories = params.categoryIds
  const categoryIds = (
    Array.isArray(rawCategories) ? rawCategories : rawCategories?.split(",")
  )
    ?.map((id) => id.trim())
    .filter(isUuid)

  return {
    section: AUCTION_SECTION_TABS.some((tab) => tab.value === section)
      ? (section as AuctionSection)
      : "hot",
    q: first(params.q),
    categoryIds: categoryIds ?? [],
    minPrice: toNumber(params.minPrice),
    maxPrice: toNumber(params.maxPrice),
    page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1,
  }
}

/** Everything a section shows before anybody narrows it. */
export const NO_AUCTION_FILTERS: Pick<
  AuctionSearch,
  "q" | "categoryIds" | "minPrice" | "maxPrice"
> = {
  q: undefined,
  categoryIds: [],
  minPrice: undefined,
  maxPrice: undefined,
}

/** Whether anything is currently narrowing the list the section chose. */
export function hasAuctionFilters(search: AuctionSearch): boolean {
  return (
    search.q !== undefined ||
    search.categoryIds.length > 0 ||
    search.minPrice !== undefined ||
    search.maxPrice !== undefined
  )
}

/**
 * Builds the next list URL. Any change other than paging resets to page 1,
 * because page 5 of the previous filter rarely exists under the new one — and
 * page 5 of "ending soon" rarely exists under "starting soon".
 *
 * Filters survive a change of section on purpose: somebody who narrowed to
 * watches under ฿5,000 and then looked at what is closing soon still means
 * watches under ฿5,000. `ActiveAuctionFilters` is what shows them the
 * conditions they are still carrying, and gives them one click to drop each.
 *
 * `hot` and page 1 are left out of the query: they are the defaults, and a
 * clean `/auctions` is a nicer thing to share than `/auctions?section=hot&page=1`.
 */
export function auctionHref(
  current: AuctionSearch,
  overrides: Partial<AuctionSearch> = {}
): string {
  const next = { ...current, ...overrides }
  const page = "page" in overrides ? next.page : 1

  return `/auctions${buildQuery({
    section: next.section === "hot" ? undefined : next.section,
    q: next.q,
    categoryIds: next.categoryIds,
    minPrice: next.minPrice,
    maxPrice: next.maxPrice,
    page: page > 1 ? page : undefined,
  })}`
}
