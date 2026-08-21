"use client"

import { useState } from "react"
import { Minus, Plus } from "lucide-react"

import { AddToCartButton } from "@/components/cart/add-to-cart-button"
import { NegotiateButton } from "@/components/shop/negotiate-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPercent, formatTHB } from "@/lib/format"
import type { Product } from "@/lib/api/types"

/**
 * PROD-007 — mirrors `calculateLineTotal` in apps/api so the buyer sees the
 * discounted price *before* adding to the cart. This is a preview only: the
 * cart and the order both take their numbers from the server (CART-002).
 */
function previewLine(product: Product, quantity: number) {
  const unitPrice = Number(product.price)
  const rule = product.quantityDiscount
  const qualifies = rule !== null && quantity >= rule.minQty

  if (!qualifies) {
    return { effectiveUnitPrice: unitPrice, subtotal: unitPrice * quantity }
  }

  const effectiveUnitPrice =
    Math.round(((unitPrice * (100 - Number(rule.percent))) / 100) * 100) / 100

  return {
    effectiveUnitPrice,
    subtotal: Math.round(effectiveUnitPrice * quantity * 100) / 100,
  }
}

export function ProductPurchasePanel({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1)

  const soldOut = product.stockQty === 0 || product.status !== "ACTIVE"
  const maxQty = Math.max(product.stockQty, 1)
  const preview = previewLine(product, quantity)
  const discountApplied =
    product.quantityDiscount !== null &&
    quantity >= product.quantityDiscount.minQty

  return (
    <div className="flex flex-col gap-5 rounded-r4 bg-white p-6 shadow-sh1">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-3xl font-extrabold text-ink">
            {formatTHB(preview.effectiveUnitPrice)}
          </span>
          {discountApplied && (
            <span className="text-base text-n-500 line-through">
              {formatTHB(product.price)}
            </span>
          )}
        </div>

        {product.quantityDiscount && (
          <p className="mt-2 text-sm text-n-600">
            <Badge variant="sale">
              ซื้อ {product.quantityDiscount.minQty}+ ลด{" "}
              {formatPercent(product.quantityDiscount.percent)}
            </Badge>{" "}
            {discountApplied
              ? "ส่วนลดถูกใช้แล้ว"
              : `เพิ่มอีก ${product.quantityDiscount.minQty - quantity} ชิ้นเพื่อรับส่วนลด`}
          </p>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-ink">จำนวน</span>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="ลดจำนวน"
            disabled={quantity <= 1 || soldOut}
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          >
            <Minus />
          </Button>
          <span className="w-10 text-center font-display text-lg font-bold text-ink">
            {quantity}
          </span>
          <Button
            variant="secondary"
            size="icon"
            aria-label="เพิ่มจำนวน"
            disabled={quantity >= maxQty || soldOut}
            onClick={() =>
              setQuantity((current) => Math.min(maxQty, current + 1))
            }
          >
            <Plus />
          </Button>
        </div>
      </div>

      <p className="text-xs text-n-500">
        {/* CART-001 caps quantity at live stock; nothing is reserved yet */}
        เหลือในสต็อก {product.stockQty} ชิ้น
      </p>

      <div className="flex items-center justify-between rounded-r3 bg-n-100 px-4 py-3">
        <span className="text-sm text-n-600">รวม {quantity} ชิ้น</span>
        <span className="font-display text-xl font-bold text-ink">
          {formatTHB(preview.subtotal)}
        </span>
      </div>

      <AddToCartButton
        productId={product.id}
        quantity={quantity}
        disabled={soldOut}
        label={soldOut ? "สินค้าหมด" : "เพิ่มลงตะกร้า"}
        size="lg"
        block
      />

      <NegotiateButton productId={product.id} />
    </div>
  )
}
