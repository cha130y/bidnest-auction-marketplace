import type { Metadata } from "next"
import Link from "next/link"

import { CreateProductScreen } from "@/components/product/create-product-screen"

export const metadata: Metadata = {
  title: "ลงขายสินค้า · BidNest",
  description: "ลงขายสินค้าใหม่บน BidNest",
}

/** PROD-001 — list an item for sale. */
export default function NewProductPage() {
  return (
    <>
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          ลงขายสินค้า
        </h1>
        <p className="mt-2 text-base text-n-600">
          กรอกให้ครบแล้วกดบันทึก — สินค้าจะขึ้นขายทันที ไม่มีขั้นตอนร่าง
        </p>
        <Link
          href="/sell"
          className="mt-2 inline-block text-sm font-semibold text-amber-600 hover:text-ink"
        >
          ต้องการลงประมูลแทน?
        </Link>
      </header>

      <CreateProductScreen />
    </>
  )
}