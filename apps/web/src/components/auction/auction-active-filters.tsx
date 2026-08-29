import Link from "next/link"
import { X } from "lucide-react"

import { categoryLabel } from "@/lib/category-labels"
import { formatTHB } from "@/lib/format"
import {
  NO_AUCTION_FILTERS,
  auctionHref,
  type AuctionSearch,
} from "@/lib/auction-search"
import type { CategoryTree } from "@/lib/api/types"

type Chip = { key: string; label: string; href: string }

function buildChips(search: AuctionSearch, categories: CategoryTree[]): Chip[] {
  const chips: Chip[] = []

  if (search.q) {
    chips.push({
      key: "q",
      label: `ค้นหา: ${search.q}`,
      href: auctionHref(search, { q: undefined }),
    })
  }

  // Roots and children flattened once, so a chip can name the category it
  // removes rather than saying "หมวดหมู่" four times over
  const byId = new Map(
    categories
      .flatMap((root) => [root, ...root.children])
      .map((category) => [category.id, category])
  )

  for (const id of search.categoryIds) {
    const category = byId.get(id)
    chips.push({
      key: `category-${id}`,
      label: category ? categoryLabel(category) : "หมวดหมู่",
      href: auctionHref(search, {
        categoryIds: search.categoryIds.filter((value) => value !== id),
      }),
    })
  }

  if (search.minPrice !== undefined || search.maxPrice !== undefined) {
    const from =
      search.minPrice !== undefined ? formatTHB(search.minPrice) : "ไม่จำกัด"
    const to =
      search.maxPrice !== undefined ? formatTHB(search.maxPrice) : "ไม่จำกัด"

    chips.push({
      key: "price",
      // One chip for the pair: half a range is not a condition anybody set on
      // its own, and dropping only the top of it is not a thing to want.
      label: `ราคา ${from} – ${to}`,
      href: auctionHref(search, { minPrice: undefined, maxPrice: undefined }),
    })
  }

  return chips
}

/**
 * AUC-008 — what is currently narrowing the list, with one click to drop each
 * condition.
 *
 * Here rather than in the sidebar for the reason Dev 3's `ActiveFilters` gives
 * about the catalogue: the panel can only show what is *checked*, and a
 * collapsed category group hides exactly that. It matters more on this list,
 * because filters survive a change of section — somebody who lands on
 * "ปิดเร็วๆ นี้" and finds three results is owed a visible reason why.
 *
 * A near-twin of that component, which is not ideal. The two differ only in
 * which `…Href` they call and what "clear everything" means, so an `hrefFor`
 * prop would let one serve both — the same lift `AuctionPagination` already
 * flags. It edits a file Dev 3 owns, so it is noted here rather than done in
 * passing.
 */
export function ActiveAuctionFilters({
  search,
  categories,
}: {
  search: AuctionSearch
  categories: CategoryTree[]
}) {
  const chips = buildChips(search, categories)
  if (chips.length === 0) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white pr-2 pl-3.5 text-sm text-ink shadow-sh1 transition-colors hover:bg-amber-50 hover:text-amber-600"
        >
          {chip.label}
          <X className="size-3.5" />
        </Link>
      ))}

      {chips.length > 1 && (
        // Keeps the section, drops the conditions — the same thing the
        // sidebar's "ล้างตัวกรอง" does, since this list has a section in its
        // URL that the catalogue has no equivalent of.
        <Link
          href={auctionHref(search, NO_AUCTION_FILTERS)}
          className="px-2 text-sm font-semibold text-n-500 transition-colors hover:text-ink"
        >
          ล้างทั้งหมด
        </Link>
      )}
    </div>
  )
}
