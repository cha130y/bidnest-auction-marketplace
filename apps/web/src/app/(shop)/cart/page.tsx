import type { Metadata } from "next"

import { UnpaidWinsBanner } from "@/components/auction/unpaid-wins-banner"
import { PayableOffersBanner } from "@/components/shop/payable-offers-banner"
import { CartView } from "@/components/cart/cart-view"

export const metadata: Metadata = {
  title: "ตะกร้าสินค้า · BidNest",
  description: "สินค้าที่คุณเลือกไว้ พร้อมส่วนลดตามจำนวนและยอดรวม",
}

/**
 * CART-002/003 — the cart the header's badge has been counting.
 *
 * Inside the `(shop)` group so it gets the storefront header and footer, and
 * the `CartProvider` that already holds the one shared read of `GET /cart`.
 */
export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          ตะกร้าสินค้า
        </h1>
        <p className="mt-2 text-base text-n-600">
          ตรวจสอบรายการและจำนวนก่อนชำระเงิน
        </p>
      </header>

      {/* CART-004 — above the cart rather than inside it: a winner with an
          empty cart is exactly who needs this, and `CartView` returns its
          empty state before it would ever get to draw one. */}
      <UnpaidWinsBanner />

      {/* AI-003 — the same reminder for a price that was negotiated rather
          than won. It lapses in fifteen minutes, so it is the more urgent of
          the two. */}
      <PayableOffersBanner />

      <CartView />
    </div>
  )
}