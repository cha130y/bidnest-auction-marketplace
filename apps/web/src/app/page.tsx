import type { Metadata } from "next"
import { Suspense } from "react"

import { HomeEndingSoonSection } from "@/components/auction/home-ending-soon-section"
import { CartProvider } from "@/components/cart/cart-provider"
import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"
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
 * Two rows: the 5 auctions closing soonest, and 5 random active listings.
 * Each is read inside its own `<Suspense>`, so a slow or failing row costs
 * only itself rather than the other one.
 */
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <header className="py-8">
            <p className="text-xs font-semibold tracking-[0.18em] text-amber-600 uppercase">
              Live bidding & shopping
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              BidNest
            </h1>
            <p className="mt-2 max-w-2xl text-base text-n-600">
              ประมูลแบบเรียลไทม์ควบคู่กับการช้อปปิ้งซื้อได้ทันที
              เห็นราคาปัจจุบัน เวลาที่เหลือ และสินค้าใหม่ในที่เดียว
            </p>
          </header>

          <Suspense
            fallback={
              <HomeSectionFallback
                title="ปิดเร็วๆ นี้"
                description="ใกล้ถึงเวลาปิดที่สุด"
              />
            }
          >
            <HomeEndingSoonSection />
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
