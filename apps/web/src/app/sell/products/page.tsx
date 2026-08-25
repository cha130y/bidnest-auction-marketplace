import type { Metadata } from "next"
import Link from "next/link"

import { SellerShell } from "@/components/auction/seller-shell"
import { OwnedProductsList } from "@/components/product/owned-products-screen"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "สินค้าของฉัน · BidNest",
  description: "สินค้าที่คุณลงขายบน BidNest",
}

/** PROD-002 — the seller's own listings, in every state. */
export default function OwnedProductsPage() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            สินค้าของฉัน
          </h1>
          <p className="mt-2 text-base text-n-600">
            รวมสินค้าที่หยุดขาย สินค้าหมด และที่ถูกระงับ — หน้าร้านไม่แสดงให้เห็น
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            nativeButton={false}
            render={<Link href="/sell/orders" />}
          >
            คำสั่งซื้อที่ขายได้
          </Button>
          <Button
            variant="primary"
            size="lg"
            nativeButton={false}
            render={<Link href="/sell/products/new" />}
          >
            ลงขายสินค้า
          </Button>
        </div>
      </header>

      <SellerShell>
        <OwnedProductsList />
      </SellerShell>
    </>
  )
}
