import type { Metadata } from "next"
import Link from "next/link"

import { SellerShell } from "@/components/auction/seller-shell"
import { SellingOrderDetail } from "@/components/order/selling-order-detail"

export const metadata: Metadata = {
  title: "จัดการคำสั่งซื้อ · BidNest",
  description: "รายละเอียดคำสั่งซื้อและการอัปเดตสถานะจัดส่ง",
}

/** SHIP-001 — where the seller moves the parcel. */
export default async function SellingOrderPage({
  params,
}: PageProps<"/sell/orders/[id]">) {
  const { id } = await params

  return (
    <>
      <nav className="py-6 text-sm text-n-500">
        <Link href="/sell/orders" className="hover:text-ink">
          คำสั่งซื้อที่ขายได้
        </Link>
        <span className="px-2">/</span>
        <span className="text-n-600">จัดการ</span>
      </nav>

      <SellerShell>
        <SellingOrderDetail orderId={id} />
      </SellerShell>
    </>
  )
}
