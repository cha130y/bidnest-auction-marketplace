import type { Metadata } from "next"
import { Suspense } from "react"

import {
  HomeSectionFeed,
  type HomeSectionDefinition,
} from "@/components/auction/home-section-feed"
import { HomeSectionSkeleton } from "@/components/auction/home-section-skeleton"
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
 * returned while the built server went on showing the old title. For a page
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

/**
 * The four cards, in the order the home page design lays them out.
 *
 * One card each, showing the auction currently at the top of that section —
 * not a row of four per section. The section's own ordering on the server
 * already decides which auction that is, so each card is a way in rather than
 * a shortlist, and "ดูทั้งหมด" opens the section proper.
 *
 * Read from one endpoint (AUC-008) that fixes each section's filter and
 * ordering, so nothing here decides what "ending soon" means.
 */
const SECTIONS: HomeSectionDefinition[] = [
  {
    id: "hot-auctions",
    section: "hot",
    label: "ประมูลยอดนิยม",
    description: "เสนอราคากันมากที่สุดตอนนี้",
    emptyMessage: "ยังไม่มีการประมูลที่เปิดอยู่",
  },
  {
    id: "ending-soon",
    section: "ending-soon",
    label: "ปิดเร็วๆ นี้",
    description: "ใกล้ถึงเวลาปิดที่สุด",
    emptyMessage: "ยังไม่มีรายการที่ใกล้ปิด",
  },
  {
    id: "starting-soon",
    section: "starting-soon",
    label: "กำลังจะเริ่ม",
    description: "ดูล่วงหน้าก่อนห้องเปิด",
    emptyMessage: "ยังไม่มีรายการที่ตั้งเวลาไว้",
  },
  {
    id: "recent-results",
    section: "recently-ended",
    label: "ผลประมูลล่าสุด",
    description: "เพิ่งจบไปพร้อมราคาปิด",
    emptyMessage: "ยังไม่มีการประมูลที่จบลง",
  },
]

/**
 * A Server Component because every section is a `@Public()` route: no bearer
 * token is involved, so the page ships no client JS of its own.
 *
 * Each card is read inside its own `<Suspense>`, which buys the isolation:
 * four parallel reads, each landing when it lands, and a slow or failing
 * section costing only its own card.
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

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {SECTIONS.map((definition) => (
              <Suspense
                key={definition.id}
                fallback={<HomeSectionSkeleton definition={definition} />}
              >
                <HomeSectionFeed definition={definition} />
              </Suspense>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
