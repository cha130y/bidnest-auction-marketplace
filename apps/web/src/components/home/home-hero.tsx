import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { AuctionCountdownChip } from "@/components/auction/auction-countdown-chip"
import { AuctionImage } from "@/components/auction/auction-image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { listAuctions } from "@/lib/api/auctions"
import { categoryLabel } from "@/lib/category-labels"
import { formatTHB } from "@/lib/format"

/** Home page hero, static half — copy and CTAs, no data dependency. */
export function HomeHero({ spotlight }: { spotlight: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden py-10 md:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-24 size-[420px] animate-beam-breathe rounded-full bg-amber-500/25 blur-3xl"
      />

      <div className="mx-auto grid w-full max-w-330 gap-11 px-4 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-14 md:px-6">
        <div>
          <Badge variant="new" dot className="h-[30px] px-3.5 text-[11px] tracking-[0.14em] uppercase">
            Live bidding &amp; shopping
          </Badge>

          <h1 className="mt-4 font-display text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.02] font-extrabold tracking-tight text-ink">
            BidNest
          </h1>

          <p className="mt-4 max-w-lg text-base leading-relaxed text-n-600 md:text-lg">
            ประมูลแบบเรียลไทม์ควบคู่กับการช้อปปิ้งซื้อได้ทันที
            เห็นราคาปัจจุบัน เวลาที่เหลือ และสินค้าใหม่ในที่⁠เดียว
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Button size="lg" nativeButton={false} render={<Link href="/auctions" />}>
              เริ่มประมูลเลย
              <ArrowRight />
            </Button>
            <Button
              size="lg"
              variant="dark"
              nativeButton={false}
              render={<Link href="/shop" />}
            >
              ช้อปสินค้า
            </Button>
          </div>
        </div>

        {spotlight}
      </div>
    </section>
  )
}

/**
 * The hero's live half — one "hot" auction (AUC-008), fetched on its own
 * `<Suspense>` boundary in `page.tsx` so a slow read never blocks the static
 * copy above from painting.
 */
export async function HomeHeroSpotlight() {
  let auction: Awaited<ReturnType<typeof listAuctions>>["items"][number] | undefined

  try {
    const page = await listAuctions({ section: "hot", limit: 1 })
    auction = page.items[0]
  } catch {
    auction = undefined
  }

  if (!auction) {
    return (
      <div className="flex aspect-4/5 items-center justify-center rounded-r5 bg-white p-8 text-center text-n-500 shadow-sh3 md:aspect-auto md:h-full">
        ยังไม่มีประมูลเด่นในตอนนี้
      </div>
    )
  }

  const primaryImage =
    auction.images.find((image) => image.isPrimary) ?? auction.images[0]
  const price =
    auction.bidCount === 0 ? auction.startingPrice : auction.currentPrice

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="block rounded-r5 bg-white p-5 shadow-sh3 transition-transform hover:-translate-y-1"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="live" dot>
          กำลังประมูล
        </Badge>
        <span className="text-xs text-n-400">อัปเดตล่าสุดตอนนี้</span>
      </div>

      <AuctionImage
        src={primaryImage?.url}
        alt={auction.title}
        className="mt-3.5 aspect-16/11 w-full rounded-r3"
      />

      <div className="mt-3.5">
        <span className="text-xs text-n-500">
          {categoryLabel(auction.category)}
        </span>
        <h3 className="mt-0.5 line-clamp-2 font-display text-lg font-bold text-ink">
          {auction.title}
        </h3>
        <p className="mt-0.5 text-xs text-n-500">
          โดย {auction.seller.displayName ?? "ไม่ระบุชื่อ"}
        </p>
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-n-500">
            {auction.bidCount === 0 ? "ราคาเริ่มต้น" : "ราคาปัจจุบัน"}
          </p>
          <p className="font-display text-2xl font-extrabold text-ink">
            {formatTHB(price)}
          </p>
        </div>
        <p className="text-xs text-n-500">
          เสนอราคาแล้ว {auction.bidCount.toLocaleString("th-TH")} ครั้ง
        </p>
      </div>

      {auction.currentEndAt && (
        <AuctionCountdownChip currentEndAt={auction.currentEndAt} />
      )}
    </Link>
  )
}

export function HomeHeroSpotlightFallback() {
  return (
    <div className="aspect-4/5 animate-pulse rounded-r5 bg-white shadow-sh3 md:aspect-auto md:h-full" />
  )
}
