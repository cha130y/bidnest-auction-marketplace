import type { Metadata } from "next"
import Link from "next/link"

import { EditProductScreen } from "@/components/product/edit-product-screen"

export const metadata: Metadata = {
  title: "แก้ไขสินค้า · BidNest",
  description: "แก้ไขรายละเอียดและรูปสินค้าที่ลงขายไว้",
}

/** PROD-002 — edit a listing and manage its pictures. */
export default async function EditProductPage({
  params,
}: PageProps<"/sell/products/[id]">) {
  const { id } = await params

  return (
    <>
      <nav className="py-6 text-sm text-n-500">
        <Link href="/sell/products" className="hover:text-ink">
          สินค้าของฉัน
        </Link>
        <span className="px-2">/</span>
        <span className="text-n-600">แก้ไข</span>
      </nav>

      <EditProductScreen productId={id} />
    </>
  )
}
