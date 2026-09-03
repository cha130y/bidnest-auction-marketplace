import type { Metadata } from "next"
import Link from "next/link"

import { ArenaPanel } from "@/components/auction/arena-panel"
import { AuctionGallery } from "@/components/auction/auction-gallery"
import { AuctionNegotiateButton } from "@/components/auction/negotiate-button"
import { WatchButton } from "@/components/auction/watch-button"
import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"
import { getArena } from "@/lib/api/auctions"
import { readArena } from "@/lib/api/read-arena"
import { categoryLabel } from "@/lib/category-labels"
import { formatTHB } from "@/lib/format"

export async function generateMetadata({
  params,
}: PageProps<"/auctions/[id]">): Promise<Metadata> {
  const { id } = await params

  try {
    const { auction } = await getArena(id)
    return {
      title: `${auction.title} · BidNest`,
      description: auction.description.slice(0, 160),
    }
  } catch {
    return { title: "ไม่พบการประมูล · BidNest" }
  }
}

export default async function AuctionDetailPage({
  params,
}: PageProps<"/auctions/[id]">) {
  const { id } = await params
  const arena = await readArena(id)
  const { auction } = arena

  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <nav className="py-6 text-sm text-n-500">
            <Link href="/auctions" className="hover:text-ink">
              ประมูลทั้งหมด
            </Link>
            <span className="px-2">/</span>
            <span className="text-n-600">
              {categoryLabel(auction.category)}
            </span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <AuctionGallery images={auction.images} title={auction.title} />

              <dl className="mt-6 grid gap-3 rounded-r4 bg-white p-5 text-sm shadow-sh1">
                <Row label="สภาพสินค้า" value={auction.condition === "NEW" ? "ของใหม่" : "มือสอง"} />
                <Row label="ราคาเริ่มต้น" value={formatTHB(auction.startingPrice)} />
                <Row label="เพิ่มขั้นต่ำครั้งละ" value={formatTHB(auction.minBidIncrement)} />
                {/*
                  AUC-003 — the computed answer, never the reserve itself, and
                  worded so it holds whether or not there is a reserve to
                  compute against.

                  `reserveMet` is `true` both for an auction whose price has
                  passed its reserve and for one that never had a reserve, and
                  the API will not say which: announcing "this seller set no
                  reserve" gives a bidder as much as the amount would. So this
                  row cannot branch on whether a reserve exists — it can only
                  say something true in both cases. "ถึงแล้ว" was not: it
                  claimed a threshold had been crossed on every auction that
                  never had one, which is most of them.

                  The false branch may still name the reserve. An auction
                  reports `false` only when it has one.
                */}
                <Row
                  label="สถานะราคา"
                  value={
                    auction.reserveMet
                      ? "ผู้ขายรับราคานี้ได้"
                      : "ยังไม่ถึงราคาที่ผู้ขายรับได้"
                  }
                />
                {auction.extensionCount > 0 && (
                  <Row label="ต่อเวลาแล้ว" value={`${auction.extensionCount} ครั้ง`} />
                )}
              </dl>
            </div>

            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
                {auction.title}
              </h1>

              <p className="mt-2 mb-5 text-sm text-n-500">
                โดย {auction.seller.displayName ?? "ไม่ระบุชื่อ"} ·{" "}
                {categoryLabel(auction.category)}
              </p>

              {/* Everything that moves lives in here; the rest of the page is
                  server-rendered and stays put. */}
              <ArenaPanel auctionId={auction.id} initialArena={arena} />

              {/* WAT-001 — reads its own state: this page is rendered without
                  a token, so it cannot know whether the viewer follows it. */}
              <WatchButton auctionId={auction.id} className="mt-4" />

              <div className="mt-3">
                <AuctionNegotiateButton auctionId={auction.id} />
              </div>
            </div>
          </div>

          <section className="mt-10 rounded-r4 bg-white p-6 shadow-sh1">
            <h2 className="font-display text-lg font-bold text-ink">
              รายละเอียดสินค้า
            </h2>
            <p className="mt-3 text-sm leading-7 whitespace-pre-line text-n-600">
              {auction.description}
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-n-500">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}
