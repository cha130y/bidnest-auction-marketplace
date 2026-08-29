import Link from "next/link"

import { cn } from "@/lib/utils"
import {
  AUCTION_SECTION_TABS,
  auctionHref,
  type AuctionSearch,
} from "@/lib/auction-search"

/**
 * Switching sections is navigation, not state: each tab is a real link to a
 * real URL, so the page stays a Server Component, the back button works, and a
 * section is something a visitor can send to somebody else.
 *
 * `aria-current="page"` rather than a `role="tab"` widget for the same reason —
 * these are links between pages, and calling them tabs would promise keyboard
 * behaviour (arrow keys moving between panels) that navigation does not have.
 */
export function AuctionSectionTabs({ search }: { search: AuctionSearch }) {
  return (
    <nav
      aria-label="หมวดการประมูล"
      className="flex flex-wrap gap-2 rounded-r4 bg-white p-2 shadow-sh1"
    >
      {AUCTION_SECTION_TABS.map((tab) => {
        const isActive = tab.value === search.section

        return (
          <Link
            key={tab.value}
            href={auctionHref(search, { section: tab.value })}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-r2 px-4 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "bg-amber-500 text-ink"
                : "text-n-600 hover:bg-n-100 hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
