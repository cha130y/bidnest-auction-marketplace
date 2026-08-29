import type { Metadata } from "next"
import Link from "next/link"

import { SellerShell } from "@/components/auction/seller-shell"
import { SellingOrderList } from "@/components/order/selling-order-list"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "คำสั่งซื้อที่ขายได้ · BidNest",
  description: "คำสั่งซื้อของร้านคุณ พร้อมอัปเดตสถานะการจัดส่ง",
}

/** SHIP-001/SHIP-003 — the seller's side of an order, where the parcel moves. */
export default function SellingOrdersPage() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            คำสั่งซื้อที่ขายได้
          </h1>
          <p className="mt-2 text-base text-n-600">
            อัปเดตสถานะการจัดส่งทีละขั้น ผู้ซื้อจะเห็นทันทีที่คุณกด
          </p>
        </div>
        <Button
          variant="secondary"
          size="lg"
          nativeButton={false}
          render={<Link href="/sell/products" />}
        >
          สินค้าของฉัน
        </Button>
      </header>

      <SellerShell>
        <SellingOrderList />
      </SellerShell>
    </>
  )
}
