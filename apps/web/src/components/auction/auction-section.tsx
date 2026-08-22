import Link from "next/link"

import { AuctionCard } from "@/components/auction/auction-card"
import { ApiError } from "@/lib/api/client"
import type { Auction } from "@/lib/api/types"

/**
 * One of the four cards on the home page — hot, ending soon, starting soon,
 * recently ended — each a heading over a row of auctions.
 *
 * Takes rows rather than fetching them. The four sections are read on the
 * server with `Promise.allSettled` (every section is a `@Public()` route, so
 * no token is involved), which means one section failing shows its own error
 * while the other three still render. cbeave carries `isPending` / `isError` /
 * `onRetry` through the same component because it fetches in the browser; here
 * there is nothing to be pending on by the time this renders.
 */
export function AuctionSection({
  id,
  eyebrow,
  title,
  description,
  auctions,
  error,
  emptyMessage,
  moreHref,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  auctions: Auction[]
  error?: unknown
  emptyMessage: string
  moreHref: string
}) {
  return (
    <section id={id} className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-600 uppercase">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-n-600">{description}</p>
        </div>

        <Link
          href={moreHref}
          className="text-sm font-semibold text-amber-600 transition-colors hover:text-ink"
        >
          ดูทั้งหมด
        </Link>
      </div>

      {error ? (
        <SectionError error={error} />
      ) : auctions.length === 0 ? (
        <p className="mt-6 rounded-r4 bg-white px-6 py-12 text-center text-n-500 shadow-sh1">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {auctions.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </section>
  )
}

function SectionError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "โหลดรายการประมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"

  return (
    <div className="mt-6 rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
      <p className="font-semibold text-red">{message}</p>
      <p className="mt-2 text-sm text-n-600">
        ตรวจว่า API ที่ NEXT_PUBLIC_API_URL กำลังทำงานอยู่หรือไม่
      </p>
    </div>
  )
}
