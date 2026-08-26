import type { Metadata } from "next"
import { Suspense } from "react"

import { CheckoutView } from "@/components/checkout/checkout-view"

export const metadata: Metadata = {
  title: "ชำระเงิน · BidNest",
  description: "กรอกที่อยู่จัดส่งและเลือกวิธีชำระเงิน",
}

/**
 * CART-004/005 — the last step before a cart becomes orders.
 *
 * `CheckoutView` reads `useSearchParams()` (CART-003's `?items=` selection),
 * which opts the page out of static rendering unless it sits under its own
 * Suspense boundary — without one, `next build` fails outright rather than
 * just warning.
 */
export default function CheckoutPage() {
  return (
    <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          ชำระเงิน
        </h1>
      </header>

      <Suspense fallback={null}>
        <CheckoutView />
      </Suspense>
    </div>
  )
}