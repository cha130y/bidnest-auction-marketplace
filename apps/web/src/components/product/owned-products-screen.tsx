"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { ProductImage } from "@/components/shop/product-image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { listOwnProducts } from "@/lib/api/products"
import { formatTHB } from "@/lib/format"
import type { OwnerProduct, ProductStatus } from "@/lib/api/types"

/**
 * What each state means to the seller looking at it, and how loud to say it.
 * SUSPENDED is the one worth colouring like a problem — ADM-005 says only an
 * admin can lift it, so it is the only row where nothing the seller does here
 * will help.
 */
const STATUS: Record<
  ProductStatus,
  { label: string; variant: "new" | "sold" | "live" | "won" }
> = {
  ACTIVE: { label: "กำลังขาย", variant: "won" },
  INACTIVE: { label: "หยุดขายชั่วคราว", variant: "sold" },
  OUT_OF_STOCK: { label: "สินค้าหมด", variant: "new" },
  SUSPENDED: { label: "ถูกระงับโดยแอดมิน", variant: "live" },
  REMOVED: { label: "ลบแล้ว", variant: "sold" },
}

/**
 * PROD-002 — the seller's own shelf.
 *
 * Everything they have listed, including what the catalogue will not show:
 * paused listings, ones that ran out of stock, and ones an admin took down.
 * Finding those is the whole point — `/shop` deliberately cannot.
 */
export function OwnedProductsList() {
  const [products, setProducts] = useState<OwnerProduct[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false

    listOwnProducts()
      .then((result) => {
        if (!cancelled) setProducts(result.items)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!products) {
    return (
      <div
        className="h-40 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (products.length === 0) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-500">ยังไม่มีสินค้าที่ลงขาย</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/sell/products/new" />}
        >
          ลงขายสินค้าชิ้นแรก
        </Button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {products.map((product) => {
        const status = STATUS[product.status]

        return (
          <li key={product.id}>
            <Link
              href={`/sell/products/${product.id}`}
              className="flex items-center gap-4 rounded-r4 bg-white p-4 shadow-sh1 transition hover:shadow-sh2"
            >
              <ProductImage
                src={product.images[0]?.url}
                alt=""
                className="size-20 shrink-0 rounded-r3"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-bold text-ink">
                  {product.title}
                </p>
                <p className="mt-1 text-sm text-n-600">
                  {formatTHB(product.price)} · เหลือ {product.stockQty} ชิ้น ·{" "}
                  {product.images.length} รูป
                </p>
              </div>

              <Badge variant={status.variant}>{status.label}</Badge>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
