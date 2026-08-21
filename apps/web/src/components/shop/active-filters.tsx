import Link from "next/link"
import { X } from "lucide-react"

import { categoryLabel } from "@/lib/category-labels"
import { formatTHB } from "@/lib/format"
import { shopHref, type ShopSearch } from "@/lib/shop-search"
import type { CategoryTree } from "@/lib/api/types"

type Chip = { key: string; label: string; href: string }

function buildChips(search: ShopSearch, categories: CategoryTree[]): Chip[] {
  const chips: Chip[] = []

  if (search.q) {
    chips.push({
      key: "q",
      label: `ค้นหา: ${search.q}`,
      href: shopHref(search, { q: undefined }),
    })
  }

  // Flatten roots + children once so a chip can name the category it removes
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
      href: shopHref(search, {
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
      label: `ราคา ${from} – ${to}`,
      href: shopHref(search, { minPrice: undefined, maxPrice: undefined }),
    })
  }

  return chips
}

/**
 * Shows what is currently filtering the list, with one click to drop each
 * condition. The sidebar can only say what is *checked*; once a group is
 * collapsed that is no longer visible, so the active state lives out here
 * next to the results it explains.
 */
export function ActiveFilters({
  search,
  categories,
}: {
  search: ShopSearch
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
        <Link
          href="/shop"
          className="px-2 text-sm font-semibold text-n-500 transition-colors hover:text-ink"
        >
          ล้างทั้งหมด
        </Link>
      )}
    </div>
  )
}
