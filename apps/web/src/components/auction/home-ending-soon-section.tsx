import Link from "next/link"

import { AuctionCard } from "@/components/auction/auction-card"
import { listAuctions } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"

/**
 * Home page, top half — AUC-008's `ending-soon` section, capped at 5. The
 * section's own ordering (closest `currentEndAt` first, status ACTIVE only)
 * already answers "which 5 are closing soonest", so this only asks for them.
 */
export async function HomeEndingSoonSection() {
  let auctions: Awaited<ReturnType<typeof listAuctions>>["items"] = []
  let error: unknown

  try {
    const page = await listAuctions({ section: "ending-soon", limit: 5 })
    auctions = page.items
  } catch (caught) {
    error = caught
  }

  return (
    <section className="py-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">
            ปิดเร็วๆ นี้
          </h2>
          <p className="mt-1 text-sm text-n-500">ใกล้ถึงเวลาปิดที่สุด</p>
        </div>
        <Link
          href="/auctions?section=ending-soon"
          className="shrink-0 text-sm font-semibold text-amber-600 transition-colors hover:text-ink"
        >
          ดูทั้งหมด
        </Link>
      </div>

      {error !== undefined ? (
        <p className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center font-medium text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดรายการประมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      ) : auctions.length === 0 ? (
        <p className="rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
          ยังไม่มีการประมูลที่ใกล้ปิด
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {auctions.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </section>
  )
}
