import type { Metadata } from "next"

import { AuctionCard } from "@/components/auction/auction-card"
import { AuctionPagination } from "@/components/auction/auction-pagination"
import { AuctionSectionTabs } from "@/components/auction/auction-section-tabs"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { listAuctions } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"
import {
  AUCTION_PAGE_SIZE,
  AUCTION_SECTION_TABS,
  parseAuctionSearch,
} from "@/lib/auction-search"
import type { Auction, Paginated } from "@/lib/api/types"

export const metadata: Metadata = {
  title: "ประมูลทั้งหมด · BidNest",
  description: "เลือกดูการประมูลที่กำลังเปิด ใกล้ปิด กำลังจะเริ่ม และที่จบไปแล้ว",
}

const EMPTY_MESSAGE: Record<string, string> = {
  hot: "ตอนนี้ยังไม่มีการประมูลที่กำลังเปิดอยู่",
  "ending-soon": "ยังไม่มีรายการที่ใกล้ปิด",
  "starting-soon": "ยังไม่มีรายการที่ตั้งเวลาไว้",
  "recently-ended": "ยังไม่มีการประมูลที่จบลง",
}

/**
 * AUC-008 — one section at a time, paged.
 *
 * No `force-dynamic` here, unlike the home page: reading `searchParams` already
 * makes the route dynamic, which `next build` confirms by reporting it as `ƒ`.
 *
 * The section and the page live in the URL rather than in React state, so the
 * page stays a Server Component and a filtered list is something a visitor can
 * share or reach with the back button.
 */
export default async function AuctionsPage({
  searchParams,
}: PageProps<"/auctions">) {
  const search = parseAuctionSearch(await searchParams)

  let page: Paginated<Auction> | null = null
  let error: unknown

  try {
    page = await listAuctions({
      section: search.section,
      page: search.page,
      limit: AUCTION_PAGE_SIZE,
    })
  } catch (caught) {
    error = caught
  }

  const activeTab = AUCTION_SECTION_TABS.find(
    (tab) => tab.value === search.section
  )

  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader activeHref="/auctions" />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <header className="py-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              ประมูลทั้งหมด
            </h1>
            <p className="mt-2 text-base text-n-600">
              เสนอราคาแบบเรียลไทม์ — ราคาปัจจุบัน เวลาปิด
              และการต่อเวลาเมื่อมีคนเสนอราคาช่วงท้าย
            </p>
          </header>

          <AuctionSectionTabs search={search} />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-r4 bg-white px-5 py-4 shadow-sh1">
            <span className="text-sm text-n-600">
              {page
                ? `${activeTab?.label} · ${page.meta.total.toLocaleString("th-TH")} รายการ`
                : "—"}
            </span>
          </div>

          {/* Ternary rather than `error && …`: `error` is `unknown`, and
              `unknown && JSX` is `unknown`, which React will not render. */}
          {error === undefined ? null : <ListError error={error} />}

          {page && page.items.length === 0 && (
            <p className="mt-6 rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
              {EMPTY_MESSAGE[search.section]}
            </p>
          )}

          {page && page.items.length > 0 && (
            <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {page.items.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
              <AuctionPagination search={search} meta={page.meta} />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function ListError({ error }: { error: unknown }) {
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
