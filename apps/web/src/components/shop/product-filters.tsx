"use client"

import { useRouter } from "next/navigation"

import { FilterPanel } from "@/components/filters/filter-panel"
import { ProductSearchBox } from "@/components/shop/product-search-box"
import { shopHref, type ShopSearch } from "@/lib/shop-search"
import type { CategoryTree } from "@/lib/api/types"

type ProductFiltersProps = {
  search: ShopSearch
  categories: CategoryTree[]
}

/**
 * The only interactive part of the catalog. Everything it collects goes into
 * the URL — the page re-renders on the server from there, so nothing here has
 * to hold the result set.
 *
 * The panel itself is shared with any other list that filters on the same
 * category tree; what stays here is the three things only the catalog knows:
 * that its URLs are built by `shopHref`, that clearing means `/shop`, and that
 * its search field previews matching products.
 *
 * Mounted with a `key` derived from the URL, so a "clear" or a back-navigation
 * re-seeds these inputs instead of leaving stale text behind.
 */
export function ProductFilters({ search, categories }: ProductFiltersProps) {
  const router = useRouter()

  return (
    <FilterPanel
      values={search}
      categories={categories}
      // `shopHref` drops back to page 1 on anything but a page change, which is
      // what a new filter wants: page 5 of the old one rarely exists under it.
      onApply={(values) => router.push(shopHref(search, values))}
      onClear={() => router.push("/shop")}
      renderSearch={(props) => <ProductSearchBox {...props} />}
    />
  )
}