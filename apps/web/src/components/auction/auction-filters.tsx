"use client"

import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

import { FilterPanel } from "@/components/filters/filter-panel"
import { Input } from "@/components/ui/input"
import {
  NO_AUCTION_FILTERS,
  auctionHref,
  type AuctionSearch,
} from "@/lib/auction-search"
import type { CategoryTree } from "@/lib/api/types"

/**
 * AUC-008 — the only interactive part of the auction list.
 *
 * Everything it collects goes into the URL and the page re-renders on the
 * server from there, so nothing here holds a result set. Same arrangement as
 * `ProductFilters` on the catalogue, because it is the same panel: `Auction`
 * carries `title`, `description`, `categoryId` and a price, which is exactly
 * what `FilterPanel` gathers.
 *
 * What stays here is the three things only this list knows: that its URLs are
 * built by `auctionHref`, that clearing keeps the section a visitor is looking
 * at, and that its price filter has to name *which* price it means.
 *
 * Mounted with a `key` derived from the URL, so a "clear" or a back-navigation
 * re-seeds these inputs instead of leaving stale text behind.
 */
export function AuctionFilters({
  search,
  categories,
}: {
  search: AuctionSearch
  categories: CategoryTree[]
}) {
  const router = useRouter()

  return (
    <FilterPanel
      values={search}
      categories={categories}
      // `auctionHref` drops back to page 1 on anything but a page change,
      // which is what a new filter wants: page 5 of the old one rarely exists
      // under it.
      onApply={(values) => router.push(auctionHref(search, values))}
      /**
       * Clears the filters, not the section — unlike the catalogue, where
       * clearing means `/shop` because there is nothing else in the URL. Here
       * the section is which list you are reading, and somebody dropping their
       * filters while looking at "ปิดเร็วๆ นี้" has not asked to be sent back
       * to the hot list.
       */
      onClear={() => router.push(auctionHref(search, NO_AUCTION_FILTERS))}
      /**
       * A plain field, where the catalogue previews matching products and
       * jumps to one. That preview is worth its weight on a catalogue, where
       * a product page is the destination; an auction is a room with a clock
       * in it, and the thing somebody is choosing between is how much time is
       * left and what the price is up to — which is what the cards show and a
       * dropdown of titles would not.
       */
      renderSearch={({ value, onChange }) => (
        <Input
          pill
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="ชื่อหรือรายละเอียดการประมูล"
          startIcon={<Search />}
          wrapperClassName="mt-3 h-12"
          aria-label="ค้นหาการประมูล"
        />
      )}
      /**
       * Named, because an auction has two prices and this one matches
       * whichever is in force: the current price once somebody has bid, the
       * starting price before that. "ช่วงราคา" alone would leave a visitor
       * guessing which of the two numbers on the card they are filtering.
       */
      priceLabel="ช่วงราคาที่แสดง"
    />
  )
}
