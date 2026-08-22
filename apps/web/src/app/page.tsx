import type { Metadata } from "next"
import { Suspense } from "react"

import {
  AuctionSectionFeed,
  type SectionDefinition,
} from "@/components/auction/auction-section-feed"
import { AuctionSectionSkeleton } from "@/components/auction/auction-section-skeleton"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"

export const metadata: Metadata = {
  title: "BidNest — ประมูลสด และช้อปปิ้ง",
  description:
    "ประมูลแบบเรียลไทม์ ราคาปัจจุบัน นับถอยหลัง และกันปิดท้ายนาที บน BidNest",
}

/**
 * Rendered per request, never prerendered.
 *
 * Not a precaution — measured. Without this `next build` reports `/` as
 * `○ (Static)`, and a production server then serves auctions captured at build
 * time: renaming an auction in the database changed what the API and `next dev`
 * returned while the built server went on showing the old title. For a list
 * whose whole point is current prices and live deadlines, that is wrong rather
 * than merely stale.
 *
 * `<Suspense>` alone does not fix it in this project, because Cache Components
 * is off (`next.config.ts` sets no `cacheComponents`), so Next resolves the
 * boundaries at build time instead of streaming them. `dynamic` is the
 * mechanism the guide for that configuration documents; if Cache Components is
 * ever turned on, this export goes away and the Suspense boundaries below take
 * over the job on their own.
 */
export const dynamic = "force-dynamic"

/** How many auctions each of the four cards shows. */
const SECTION_SIZE = 4

/**
 * The four browse sections, in the order the home page design lays them out.
 * Read from one endpoint (AUC-008) that fixes each section's filter and
 * ordering on the server, so nothing here decides what "ending soon" means.
 */
const SECTIONS: SectionDefinition[] = [
  {
    id: "hot-auctions",
    section: "hot",
    eyebrow: "กำลังมาแรง",
    title: "ประมูลยอดนิยม",
    description: "เรียงตามจำนวนการเสนอราคา แล้วตามด้วยรายการที่ใกล้ปิดที่สุด",
    emptyMessage: "ตอนนี้ยังไม่มีการประมูลที่กำลังเปิดอยู่",
  },
  {
    id: "ending-soon",
    section: "ending-soon",
    eyebrow: "ใกล้ปิดแล้ว",
    title: "ปิดเร็วๆ นี้",
    description: "รายการที่กำลังประมูลอยู่ เรียงตามเวลาปิดที่ใกล้ที่สุด",
    emptyMessage: "ยังไม่มีรายการที่ใกล้ปิด",
  },
  {
    id: "starting-soon",
    section: "starting-soon",
    eyebrow: "เตรียมตัว",
    title: "กำลังจะเริ่ม",
    description: "ดูล่วงหน้าได้ก่อน แล้วกลับมาตอนห้องประมูลเปิด",
    emptyMessage: "ยังไม่มีรายการที่ตั้งเวลาไว้",
  },
  {
    id: "recent-results",
    section: "recently-ended",
    eyebrow: "ปิดไปแล้ว",
    title: "ผลประมูลล่าสุด",
    description: "รายการที่จบไปแล้ว พร้อมราคาปิดที่เปิดเผยได้",
    emptyMessage: "ยังไม่มีการประมูลที่จบลง",
  },
]

/**
 * A Server Component because every section is a `@Public()` route: no bearer
 * token is involved, so the page ships no client JS of its own.
 *
 * Each section is read inside its own `<Suspense>` rather than awaited here,
 * and that is not a preference — awaiting them in the page made `next build`
 * report `/` as `○ (Static)`, which for an auction list means prices and
 * deadlines frozen at build time, and a build that needs the API to be up.
 * With the reads behind Suspense the shell prerenders and every row arrives at
 * request time, which is the only honest answer for data that changes by the
 * second.
 *
 * It buys the isolation too: four parallel reads, each landing when it lands,
 * and a slow or failing section costing only its own grid.
 *
 * The chrome is rendered here rather than in a layout on purpose. Dev 3 put
 * the storefront header in the `(shop)` route group deliberately, so that
 * `app/layout.tsx` carries nothing module-specific and admin and auth render
 * without it — putting a header there would undo that. A home shell shared by
 * both halves of the product (the design has an `Auction | E-commerce` toggle
 * that `SiteHeader` does not have yet) is Dev 1's to define; until then this
 * consumes their presentational header unchanged, so whatever they add to it
 * arrives here for free.
 */
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader activeHref="/" />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <header className="py-8">
            <p className="text-xs font-semibold tracking-[0.18em] text-amber-600 uppercase">
              Live bidding
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              ประมูล
            </h1>
            <p className="mt-2 max-w-2xl text-base text-n-600">
              รายการที่เปิดให้เสนอราคาได้ตอนนี้ — เห็นราคาปัจจุบัน
              เวลาที่เหลือ และการต่อเวลาเมื่อมีคนเสนอราคาช่วงท้าย
            </p>
          </header>

          {SECTIONS.map((definition) => (
            <Suspense
              key={definition.id}
              fallback={
                <AuctionSectionSkeleton
                  definition={definition}
                  count={SECTION_SIZE}
                />
              }
            >
              <AuctionSectionFeed definition={definition} limit={SECTION_SIZE} />
            </Suspense>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
