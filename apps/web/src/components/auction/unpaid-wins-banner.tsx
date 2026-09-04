"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Trophy } from "lucide-react"

import { AuctionImage } from "@/components/auction/auction-image"
import { Button } from "@/components/ui/button"
import { unpaidWinsQueryOptions } from "@/lib/api/auctions"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { AUCTION_PARAM } from "@/lib/cart-selection"
import { formatTHB } from "@/lib/format"
import { useHydrated } from "@/lib/use-hydrated"
import type { WonAuction } from "@/lib/api/types"

/**
 * CART-004 — the lots this person won and has not paid for, wherever they are
 * about to spend money.
 *
 * A winner's only route to `/checkout?auction=…` used to be the button on the
 * auction's own result screen: close that tab, or read the "you won"
 * notification, and there was nothing left anywhere that led back to paying.
 * `/orders` could not help — the order does not exist until the payment does —
 * and neither could the cart, which holds products and never lots.
 *
 * So this goes on the three screens somebody visits with money in mind: the
 * cart, the checkout and the order list. It is a reminder rather than a page,
 * which is why it draws nothing at all when there is nothing owing.
 */
export function UnpaidWinsBanner() {
  const { token, ready: sessionReady } = useAuthToken()
  // Held until after hydration as well as after the session resolves, for the
  // reason the watch button holds its heart: the server rendered this signed
  // out, and answering differently on the first client render is a mismatch.
  const ready = useHydrated() && sessionReady
  const isAuthenticated = ready && Boolean(token)

  const { data } = useQuery({
    ...unpaidWinsQueryOptions(),
    enabled: isAuthenticated,
  })

  // Gated on the session rather than on the data alone, so signing out clears
  // the banner immediately instead of when a refetch happens to land.
  const wins = isAuthenticated ? (data?.items ?? []) : []

  // Nothing owing, still loading, or a 401 — all three draw nothing. A panel
  // saying "you owe nothing" is noise on every screen it appears on, and a
  // skeleton for a banner that is usually absent is worse: it would reserve
  // space on the cart and the checkout for something that never arrives.
  if (wins.length === 0) return null

  const hidden = (data?.meta.total ?? wins.length) - wins.length

  return (
    <section
      role="status"
      className="mb-6 rounded-r3 bg-amber-50 px-4 py-4 ring-1 ring-amber-200 md:px-5"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-amber-600 uppercase">
        <Trophy className="size-3.5" aria-hidden="true" />
        ชนะประมูลแล้ว · รอชำระเงิน
      </p>
      <h2 className="mt-1 font-display text-lg font-bold text-ink">
        คุณชนะประมูล {wins.length} รายการที่ยังไม่ได้ชำระเงิน
      </h2>
      <p className="mt-1 text-sm text-n-600">
        ล็อตที่ชนะจ่ายแยกจากตะกร้า — ราคาปิดล็อกไว้แล้ว ไม่มีให้แก้จำนวน
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {wins.map((win) => (
          <WinRow key={win.auction.id} win={win} />
        ))}
      </ul>

      {hidden > 0 && (
        // No link: there is no "lots I won" page to send anybody to. Saying
        // what makes the next one appear is the honest version of a link that
        // would go nowhere.
        <p className="mt-3 text-sm text-n-600">
          และอีก {hidden} รายการที่ยังไม่ได้ชำระเงิน — ชำระรายการข้างบนแล้วรายการถัดไปจะขึ้นมาแทน
        </p>
      )}
    </section>
  )
}

function WinRow({ win }: { win: WonAuction }) {
  const { auction } = win
  const primaryImage =
    auction.images.find((image) => image.isPrimary) ?? auction.images[0]

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-r2 bg-white px-3 py-3 shadow-sh1">
      <AuctionImage
        src={primaryImage?.url}
        alt={auction.title}
        className="size-14 shrink-0 rounded-r1"
      />

      <div className="min-w-0 flex-1">
        {/* The lot itself, for anyone who wants to check what they won before
            paying for it. The button beside it is the one that costs money, so
            the title is a quieter link than a second button would be. */}
        <Link
          href={`/auctions/${auction.id}`}
          className="line-clamp-1 font-medium text-ink hover:underline"
        >
          {auction.title}
        </Link>
        <p className="mt-0.5 text-sm text-n-600">
          ราคาปิด{" "}
          <span className="font-bold text-ink">
            {formatTHB(auction.soldPrice ?? "0")}
          </span>
        </p>
      </div>

      <Button
        variant="primary"
        size="md"
        nativeButton={false}
        render={<Link href={`/checkout?${AUCTION_PARAM}=${auction.id}`} />}
      >
        ไปชำระเงิน
      </Button>
    </li>
  )
}
