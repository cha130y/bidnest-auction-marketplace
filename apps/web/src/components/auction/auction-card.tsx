import Link from "next/link"

import { AuctionCountdownChip } from "@/components/auction/auction-countdown-chip"
import { AuctionImage } from "@/components/auction/auction-image"
import { AuctionCardWatchButton } from "@/components/auction/watch-button"
import { Badge } from "@/components/ui/badge"
import { categoryLabel } from "@/lib/category-labels"
import { formatDateTime, formatTHB } from "@/lib/format"
import type { Auction, AuctionStatus } from "@/lib/api/types"

/**
 * AUC-005 — how each status reads on a card. Written as a map rather than
 * branches in the markup so a status added later fails to compile here instead
 * of quietly rendering nothing.
 *
 * `ending` and `won` exist in the Badge as well. `ending` is not used yet: it
 * means "closing within minutes", which needs a live countdown rather than a
 * timestamp rendered on the server, and that arrives with LIV-003.
 */
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
 * The one date that matters for the state the auction is in. A card showing
 * "ปิด 14:00" on an auction that finished yesterday would be worse than
 * showing nothing.
 */
function timingLabel(auction: Auction): string {
  switch (auction.status) {
    case "SCHEDULED":
      return auction.scheduledStartAt
        ? `เริ่ม ${formatDateTime(auction.scheduledStartAt)}`
        : "ยังไม่กำหนดเวลาเริ่ม"
    case "ACTIVE":
      // BID-004 — `currentEndAt`, so an auction that anti-sniping pushed back
      // shows the deadline actually in force rather than the original one.
      return auction.currentEndAt
        ? `ปิด ${formatDateTime(auction.currentEndAt)}`
        : "ยังไม่กำหนดเวลาปิด"
    case "SOLD":
      return auction.endedAt
        ? `ขายเมื่อ ${formatDateTime(auction.endedAt)}`
        : "ขายแล้ว"
    case "UNSOLD":
      return auction.endedAt
        ? `จบเมื่อ ${formatDateTime(auction.endedAt)}`
        : "จบแล้ว"
  }
}

/**
 * Which number to lead with.
 *
 * Before the first bid `currentPrice` is 0 — that means "no price yet", not
 * "free" — so the starting price is what a buyer needs to see. The same
 * distinction the API makes when it works out `minimumNextBid`, read off
 * `bidCount` for the same reason.
 *
 * LIV-004 — once it is sold, `soldPrice` is what somebody actually paid, and
 * that is the headline.
 */
function headlinePrice(auction: Auction): { label: string; amount: string } {
  if (auction.status === "SOLD" && auction.soldPrice) {
    return { label: "ราคาปิด", amount: auction.soldPrice }
  }

  return auction.bidCount === 0
    ? { label: "ราคาเริ่มต้น", amount: auction.startingPrice }
    : { label: "ราคาปัจจุบัน", amount: auction.currentPrice }
}

export function AuctionCard({ auction }: { auction: Auction }) {
  const primaryImage =
    auction.images.find((image) => image.isPrimary) ?? auction.images[0]
  const badge = STATUS_BADGE[auction.status]
  const price = headlinePrice(auction)
  const href = `/auctions/${auction.id}`

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-r4 bg-white shadow-sh1 transition-shadow hover:shadow-sh2">
      {/* Outside the link on purpose — see AuctionCardWatchButton. */}
      <AuctionCardWatchButton auctionId={auction.id} title={auction.title} />

      <Link href={href} className="relative block">
        <AuctionImage
          src={primaryImage?.url}
          alt={auction.title}
          className="aspect-square w-full transition-transform group-hover:scale-[1.02]"
        />
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          <Badge variant={badge.variant} dot={badge.dot}>
            {badge.label}
          </Badge>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs text-n-500">
          {categoryLabel(auction.category)}
        </span>
        <Link
          href={href}
          className="line-clamp-2 font-display text-base font-semibold text-ink transition-colors hover:text-amber-600"
        >
          {auction.title}
        </Link>
        <span className="text-xs text-n-500">
          โดย {auction.seller.displayName ?? "ไม่ระบุชื่อ"}
        </span>

        <div className="mt-auto pt-3">
          <span className="text-xs text-n-500">{price.label}</span>
          <div className="font-display text-lg font-bold text-ink">
            {formatTHB(price.amount)}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-n-500">
            <span>
              {auction.bidCount === 0
                ? "ยังไม่มีผู้เสนอราคา"
                : `เสนอราคาแล้ว ${auction.bidCount.toLocaleString("th-TH")} ครั้ง`}
            </span>
          </div>
          {auction.status === "ACTIVE" && auction.currentEndAt ? (
            <AuctionCountdownChip currentEndAt={auction.currentEndAt} />
          ) : (
            <span className="mt-1 block text-xs text-n-500">
              {timingLabel(auction)}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
