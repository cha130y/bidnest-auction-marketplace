import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AuctionImage } from "@/components/auction/auction-image"
import { Badge } from "@/components/ui/badge"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { getAuction } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"
import { categoryLabel } from "@/lib/category-labels"
import { formatDateTime, formatTHB } from "@/lib/format"
import type { Auction, AuctionStatus } from "@/lib/api/types"

const STATUS_BADGE: Record<
  AuctionStatus,
  { variant: "live" | "new" | "won" | "sold"; label: string; dot?: boolean }
> = {
  ACTIVE: { variant: "live", label: "กำลังประมูล", dot: true },
  SCHEDULED: { variant: "new", label: "เริ่มเร็วๆ นี้" },
  SOLD: { variant: "won", label: "ขายแล้ว" },
  UNSOLD: { variant: "sold", label: "ไม่มีผู้ชนะ" },
}

/**
 * AUC-005 — a published auction is public to read, so this fetches without a
 * token and renders for a signed-out visitor.
 *
 * The API answers the seller's own request with `toOwnerAuction`, which carries
 * `reservePrice`. Nothing here reads that field and the render is typed as
 * `Auction` rather than `OwnerAuction` so nothing can start to: AUC-003 says
 * the reserve is the seller's alone, and `reserveMet` below is the whole of
 * what a buyer is told.
 */
async function readAuction(id: string): Promise<Auction> {
  try {
    return await getAuction(id)
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
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
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
    const auction = await getAuction(id)
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
  const auction = await readAuction(id)

  const badge = STATUS_BADGE[auction.status]
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
            </div>

            <div>
              <Badge variant={badge.variant} dot={badge.dot}>
                {badge.label}
              </Badge>

              <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
                {auction.title}
              </h1>

              <p className="mt-2 text-sm text-n-500">
                โดย {auction.seller.displayName ?? "ไม่ระบุชื่อ"} ·{" "}
                {categoryLabel(auction.category)} ·{" "}
                {auction.condition === "NEW" ? "ของใหม่" : "มือสอง"}
              </p>

              <div className="mt-6 rounded-r4 bg-white p-5 shadow-sh1">
                <PriceBlock auction={auction} />

                <dl className="mt-5 grid gap-3 border-t border-n-200 pt-5 text-sm">
                  <Row
                    label="จำนวนการเสนอราคา"
                    value={
                      auction.bidCount === 0
                        ? "ยังไม่มีผู้เสนอราคา"
                        : `${auction.bidCount.toLocaleString("th-TH")} ครั้ง`
                    }
                  />
                  <Row
                    label="ราคาเริ่มต้น"
                    value={formatTHB(auction.startingPrice)}
                  />
                  <Row
                    label="เพิ่มขั้นต่ำครั้งละ"
                    value={formatTHB(auction.minBidIncrement)}
                  />
                  {/* AUC-003 — the computed answer, never the reserve itself */}
                  <Row
                    label="ถึงราคาขั้นต่ำที่ผู้ขายรับได้"
                    value={auction.reserveMet ? "ถึงแล้ว" : "ยังไม่ถึง"}
                  />
                  <Row label="เวลา" value={timingDetail(auction)} />
                  {auction.extensionCount > 0 && (
                    <Row
                      label="ต่อเวลาแล้ว"
                      value={`${auction.extensionCount} ครั้ง`}
                    />
                  )}
                </dl>
              </div>

              {/* BID-001 / LIV-002 — the bid form and the live arena land in
                  their own requirements. Saying so beats an inert button. */}
              <p className="mt-4 rounded-r4 border border-n-300 bg-white px-5 py-4 text-sm text-n-600">
                {auction.biddingOpen
                  ? "ห้องประมูลสดและการเสนอราคากำลังจะมาในเร็วๆ นี้"
                  : "การประมูลนี้ยังไม่เปิดให้เสนอราคา"}
              </p>
            </div>
          </div>

          <section className="mt-10 rounded-r4 bg-white p-6 shadow-sh1">
            <h2 className="font-display text-lg font-bold text-ink">
              รายละเอียดสินค้า
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-n-600">
              {auction.description}
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function PriceBlock({ auction }: { auction: Auction }) {
  if (auction.status === "SOLD" && auction.soldPrice) {
    return (
      <div>
        <span className="text-xs text-n-500">ราคาปิด</span>
        <div className="font-display text-3xl font-extrabold text-ink">
          {formatTHB(auction.soldPrice)}
        </div>
      </div>
    )
  }

  const hasBids = auction.bidCount > 0

  return (
    <div>
      <span className="text-xs text-n-500">
        {hasBids ? "ราคาปัจจุบัน" : "ราคาเริ่มต้น"}
      </span>
      <div className="font-display text-3xl font-extrabold text-ink">
        {formatTHB(hasBids ? auction.currentPrice : auction.startingPrice)}
      </div>
      {auction.biddingOpen && (
        // LIV-002 — the API works this out, because the opening bid is measured
        // against the starting price rather than a `currentPrice` of 0
        <p className="mt-1 text-sm text-n-600">
          เสนอราคาถัดไปอย่างน้อย{" "}
          <span className="font-semibold text-ink">
            {formatTHB(auction.minimumNextBid)}
          </span>
        </p>
      )}
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

function timingDetail(auction: Auction): string {
  switch (auction.status) {
    case "SCHEDULED":
      return auction.scheduledStartAt
        ? `เริ่ม ${formatDateTime(auction.scheduledStartAt)}`
        : "ยังไม่กำหนดเวลาเริ่ม"
    case "ACTIVE":
      return auction.currentEndAt
        ? `ปิด ${formatDateTime(auction.currentEndAt)}`
        : "ยังไม่กำหนดเวลาปิด"
    default:
      return auction.endedAt ? formatDateTime(auction.endedAt) : "จบแล้ว"
  }
}
