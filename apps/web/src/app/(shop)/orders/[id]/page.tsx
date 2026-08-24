import type { Metadata } from "next"
import Link from "next/link"

import { OrderDetail } from "@/components/order/order-detail"

export const metadata: Metadata = {
  title: "รายละเอียดคำสั่งซื้อ · BidNest",
  description: "สินค้าในคำสั่งซื้อ ที่อยู่จัดส่ง และสถานะพัสดุ",
}

/** SHIP-002/003 — one order, and where its parcel has got to. */
export default async function OrderDetailPage({
  params,
}: PageProps<"/orders/[id]">) {
  const { id } = await params

  return (
    <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
      <nav className="py-6 text-sm text-n-500">
        <Link href="/orders" className="hover:text-ink">
          คำสั่งซื้อของฉัน
        </Link>
        <span className="px-2">/</span>
        <span className="text-n-600">รายละเอียด</span>
      </nav>

      <OrderDetail orderId={id} />
    </div>
  )
}