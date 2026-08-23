import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ArenaPanel } from "@/components/auction/arena-panel"
import { AuctionImage } from "@/components/auction/auction-image"
import { WatchButton } from "@/components/auction/watch-button"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { getArena } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"
import { categoryLabel } from "@/lib/category-labels"
import { formatTHB } from "@/lib/format"
import type { AuctionArena } from "@/lib/api/types"

/**
 * AUC-005 / LIV-002 — a published auction is public to read, so this fetches
 * without a token and renders for a signed-out visitor.
 *
 * Reads the arena rather than the auction alone: it carries the same auction
 * plus everything that moves — the leader, the latest bids, how close to the
 * deadline it is, and the result once there is one — in one round trip.
 *
 * AUC-003 shaped what reaches the browser. `GET /auctions/:id` answers the
 * seller's own request with `toOwnerAuction`, which carries `reservePrice`;
 * the arena's `auction` is the public shape and has no such field, so nothing
 * here can render the reserve even by accident. What a buyer is told is
 * `reserveMet`, in words.
 */
async function readArena(id: string): Promise<AuctionArena> {
  try {
    return await getArena(id)
  } catch (error) {
    // A draft, a cancelled auction, a deleted one, or an id that never existed
    // all arrive here as 404 — the API deliberately does not distinguish, so
    // neither does this.
    //
    // 400 lands here too, and belongs with them: the route's only parameter is
    // the id, and `ParseUUIDPipe` rejects anything that is not a uuid before
    // the handler runs. From a visitor's side `/auctions/not-a-uuid` is an
    // auction that does not exist, so it gets the same page. Letting the 400
    // through instead rendered a 500 — which claims this server broke, and
    // would wake somebody up over a mistyped URL.
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
    ) {
      notFound()
    }
    throw error
  }
}

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

  const primaryImage =
    auction.images.find((image) => image.isPrimary) ?? auction.images[0]
  const gallery = auction.images.filter((image) => image !== primaryImage)

  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader activeHref="/auctions" />

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
              <AuctionImage
                src={primaryImage?.url}
                alt={auction.title}
                className="aspect-square w-full rounded-r4 shadow-sh1"
              />
              {gallery.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-3">
                  {gallery.map((image) => (
                    <AuctionImage
                      key={image.url}
                      src={image.url}
                      alt={auction.title}
                      className="aspect-square w-full rounded-r2 shadow-sh1"
                    />
                  ))}
                </div>
              )}

              <dl className="mt-6 grid gap-3 rounded-r4 bg-white p-5 text-sm shadow-sh1">
                <Row label="สภาพสินค้า" value={auction.condition === "NEW" ? "ของใหม่" : "มือสอง"} />
                <Row label="ราคาเริ่มต้น" value={formatTHB(auction.startingPrice)} />
                <Row label="เพิ่มขั้นต่ำครั้งละ" value={formatTHB(auction.minBidIncrement)} />
                {/* AUC-003 — the computed answer, never the reserve itself */}
                <Row
                  label="ถึงราคาขั้นต่ำที่ผู้ขายรับได้"
                  value={auction.reserveMet ? "ถึงแล้ว" : "ยังไม่ถึง"}
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
