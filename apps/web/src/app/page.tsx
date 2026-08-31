import type { Metadata } from "next"
import { Suspense } from "react"

import { HomeAuctionSections } from "@/components/auction/home-auction-sections"
import { CartProvider } from "@/components/cart/cart-provider"
import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"
import {
  HomeHero,
  HomeHeroSpotlight,
  HomeHeroSpotlightFallback,
} from "@/components/home/home-hero"
import {
  HomeLiveTicker,
  HomeLiveTickerFallback,
} from "@/components/home/home-live-ticker"
import { HomeStatsStrip } from "@/components/home/home-stats-strip"
import { HomeProductPicksSection } from "@/components/shop/home-picks-section"
import { CardGridSkeleton } from "@/components/ui/card-grid-skeleton"

export const metadata: Metadata = {
  title: "BidNest — ประมูลสด และช้อปปิ้ง",
  description:
    "ประมูลแบบเรียลไทม์ ราคาปัจจุบัน นับถอยหลัง และกันปิดท้ายนาที บน BidNest",
}

/**
 * Rendered per request, never prerendered — see the comment this replaced in
 * git history for the measured reason. Still true here: the ending-soon
 * ranking and the random product pick both need to be current, not baked in
 * at build time.
 */
export const dynamic = "force-dynamic"

/**
 * Two rows: one auction from each of AUC-008's four sections, and 5 random
 * active listings. Each is read inside its own `<Suspense>`, so a slow or
 * failing row costs only itself rather than the other one.
 */
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />

      {/* Reads the hot list now, so it gets a boundary of its own like every
          other live row on this page. */}
      <Suspense fallback={<HomeLiveTickerFallback />}>
        <HomeLiveTicker />
      </Suspense>

      <main className="flex-1">
        <HomeHero
          spotlight={
            <Suspense fallback={<HomeHeroSpotlightFallback />}>
              <HomeHeroSpotlight />
            </Suspense>
          }
        />

        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <HomeStatsStrip />

          <Suspense
            fallback={
              <HomeSectionFallback
                title="ประมูลตอนนี้"
                description="ยอดนิยม ปิดเร็วๆ นี้ กำลังจะเริ่ม และผลล่าสุด"
              />
            }
          >
            <HomeAuctionSections />
          </Suspense>

          {/* `ProductCard`'s add-to-cart button reads `useCart()`, which only
              the `(shop)` route group's layout provides — this page sits
              outside it, so the section needs its own `CartProvider`. */}
          <CartProvider>
            <Suspense
              fallback={
                <HomeSectionFallback
                  title="สินค้าแนะนำ"
                  description="หยิบมาให้ลองดู"
                />
              }
            >
              <HomeProductPicksSection />
            </Suspense>
          </CartProvider>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function HomeSectionFallback({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="py-4">
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-n-500">{description}</p>
      </div>
      <CardGridSkeleton />
    </section>
  )
}
