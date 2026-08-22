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

  return {
    section: AUCTION_SECTION_TABS.some((tab) => tab.value === section)
      ? (section as AuctionSection)
      : "hot",
    page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1,
  }
}

/**
 * Builds the next list URL. Changing section resets to page 1, because page 5
 * of "ending soon" rarely exists under "starting soon".
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
    page: page > 1 ? page : undefined,
  })}`
}
