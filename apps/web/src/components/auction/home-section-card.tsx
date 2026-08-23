import Link from "next/link"

import { AuctionCard } from "@/components/auction/auction-card"
import { ApiError } from "@/lib/api/client"
import type { Auction } from "@/lib/api/types"

/**
 * One of the four cards on the home page: a label, and the auction currently at
 * the top of that section.
 *
 * One auction rather than a row of them. The section's own ordering already
 * decides which one that is — most bidding for hot, nearest deadline for
 * ending soon — so the card is a way in rather than a shortlist, and the
 * heading beside it says which question it answers. The whole section is one
 * link away.
 */
export function HomeSectionCard({
  label,
  description,
  auction,
  error,
  emptyMessage,
  moreHref,
}: {
  label: string
  description: string
  auction: Auction | null
  error?: unknown
  emptyMessage: string
  moreHref: string
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink">{label}</h2>
          <p className="mt-0.5 truncate text-xs text-n-500">{description}</p>
        </div>
        <Link
          href={moreHref}
          className="shrink-0 text-xs font-semibold text-amber-600 transition-colors hover:text-ink"
        >
          ดูทั้งหมด
        </Link>
      </div>

      {error !== undefined ? (
        <div className="flex flex-1 items-center rounded-r4 border border-red bg-red-50 px-4 py-8 text-center text-sm">
          <p className="w-full font-medium text-red">
            {error instanceof ApiError
              ? error.message
              : "โหลดไม่สำเร็จ กรุณาลองใหม่"}
          </p>
        </div>
      ) : auction ? (
        <AuctionCard auction={auction} />
      ) : (
        <p className="flex flex-1 items-center rounded-r4 bg-white px-4 py-8 text-center text-sm text-n-500 shadow-sh1">
          <span className="w-full">{emptyMessage}</span>
        </p>
      )}
    </section>
  )
}
