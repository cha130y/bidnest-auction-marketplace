import type { Metadata } from "next"

import { UnpaidWinsBanner } from "@/components/auction/unpaid-wins-banner"
import { OrderList } from "@/components/order/order-list"

export const metadata: Metadata = {
  title: "คำสั่งซื้อของฉัน · BidNest",
  description: "คำสั่งซื้อที่สั่งไว้ พร้อมสถานะการจัดส่ง",
}

/** SHIP-003 — everything the viewer has bought. */
export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          คำสั่งซื้อของฉัน
        </h1>
        <p className="mt-2 text-base text-n-600">
          ติดตามสถานะการจัดส่งของแต่ละคำสั่งซื้อได้ที่นี่
        </p>
      </header>

      {/* CART-004 — a won lot has no order until it is paid for, so this list
          is precisely where one goes missing. The reminder is what stands in
          for the row that does not exist yet. */}
      <UnpaidWinsBanner />

      <OrderList />
    </div>
  )
}