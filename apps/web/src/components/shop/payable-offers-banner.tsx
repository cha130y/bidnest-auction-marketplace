"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Handshake } from "lucide-react"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import {
  payableOffersQueryOptions,
  type PayableOffer,
} from "@/lib/api/ai-tools"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { OFFER_PARAM } from "@/lib/cart-selection"
import { formatTHB } from "@/lib/format"
import { useOfferMinutesLeft } from "@/lib/use-offer-countdown"
import { useHydrated } from "@/lib/use-hydrated"

/**
 * AI-003 — the prices this person negotiated and has not paid for yet.
 *
 * The same reminder `UnpaidWinsBanner` is, for the same hole. An accepted
 * offer's only route to `/checkout` was the button on the card that announced
 * it, so navigating away from the listing left the offer alive in the database
 * with nothing anywhere leading back to it — and unlike a won lot, it lapses in
 * fifteen minutes, with a five minute cooldown standing between the buyer and
 * negotiating it again.
 *
 * Placed on the screens somebody opens with money in mind, and drawing nothing
 * at all when there is nothing owing.
 */
export function PayableOffersBanner() {
  const { token, ready: sessionReady } = useAuthToken()
  // Held until after hydration as well as after the session resolves: the
  // server rendered this signed out, and answering differently on the first
  // client render is a mismatch React will not patch up.
  const ready = useHydrated() && sessionReady
  const isAuthenticated = ready && Boolean(token)

  const { data } = useQuery({
    ...payableOffersQueryOptions(),
    // Every row carries a deadline, so a stale list is a list offering a price
    // that has already lapsed. A minute is well inside the fifteen.
    refetchInterval: 60_000,
    enabled: isAuthenticated,
  })

  const offers = isAuthenticated ? (data?.items ?? []) : []

  // Nothing owing, still loading, or a 401 — all three draw nothing, for the
  // reason the wins banner draws nothing: a panel announcing that you owe
  // nothing is noise on every screen it appears on.
  if (offers.length === 0) return null

  return (
    <section
      role="status"
      className="mb-6 rounded-r3 bg-amber-50 px-4 py-4 ring-1 ring-amber-200 md:px-5"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-amber-600 uppercase">
        <Handshake className="size-3.5" aria-hidden="true" />
        ต่อรองราคาสำเร็จ · รอชำระเงิน
      </p>
      <h2 className="mt-1 font-display text-lg font-bold text-ink">
        มีราคาที่ตกลงไว้ {offers.length} รายการที่ยังไม่ได้ชำระเงิน
      </h2>
      <p className="mt-1 text-sm text-n-600">
        ราคาที่ต่อรองได้ใช้ได้ครั้งเดียวและหมดอายุใน 15 นาที — เลยเวลาแล้วต้องเสนอราคาใหม่
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {offers.map((offer) => (
          <OfferRow key={offer.offerId} offer={offer} />
        ))}
      </ul>
    </section>
  )
}

function OfferRow({ offer }: { offer: PayableOffer }) {
  const minutesLeft = useOfferMinutesLeft(offer.expiresAt)

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-r2 bg-white px-3 py-3 shadow-sh1">
      <ProductImage
        src={offer.product.imageUrl}
        alt={offer.product.title}
        className="size-14 shrink-0 rounded-r1 object-cover"
      />

      <div className="min-w-0 flex-1">
        {/* Quieter than the button beside it: this one only goes back to the
            listing, and the button is the one that costs money. */}
        <Link
          href={`/shop/${offer.product.id}`}
          className="line-clamp-1 font-medium text-ink hover:underline"
        >
          {offer.product.title}
        </Link>
        <p className="mt-0.5 text-sm text-n-600">
          ราคาที่ตกลง{" "}
          <span className="font-bold text-ink">{formatTHB(offer.total)}</span>
          {offer.quantity > 1 && ` · ${offer.quantity} ชิ้น`}
          {" · "}
          <span className="text-amber-600">เหลือ {minutesLeft} นาที</span>
        </p>

        {!offer.inStock && (
          // Said before the address form rather than after it: checkout will
          // refuse this, and finding that out at the end is the worse order.
          <p className="mt-0.5 text-sm text-red">
            สินค้าเหลือไม่พอตามจำนวนที่ตกลงไว้แล้ว
          </p>
        )}
      </div>

      <Button
        variant="primary"
        size="md"
        nativeButton={false}
        disabled={!offer.inStock}
        render={<Link href={`/checkout?${OFFER_PARAM}=${offer.offerId}`} />}
      >
        ไปชำระเงิน
      </Button>
    </li>
  )
}
