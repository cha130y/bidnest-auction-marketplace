import Link from "next/link"

import { AddToCartButton } from "@/components/cart/add-to-cart-button"
import { ProductImage } from "@/components/shop/product-image"
import { Badge } from "@/components/ui/badge"
import { categoryLabel } from "@/lib/category-labels"
import { formatPercent, formatTHB } from "@/lib/format"
import type { Product } from "@/lib/api/types"

export function ProductCard({ product }: { product: Product }) {
  const primaryImage =
    product.images.find((image) => image.isPrimary) ?? product.images[0]
  const soldOut = product.stockQty === 0 || product.status === "OUT_OF_STOCK"

  return (
    <article className="group flex flex-col overflow-hidden rounded-r4 bg-white shadow-sh1 transition-shadow hover:shadow-sh2">
      <Link href={`/shop/${product.id}`} className="relative block">
        <ProductImage
          src={primaryImage?.url}
          alt={product.title}
          className="aspect-square w-full transition-transform group-hover:scale-[1.02]"
        />
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {/* PROD-007 — the rule itself, not a computed price: the discount
              only applies once the buyer reaches minQty */}
          {product.quantityDiscount && (
            <Badge variant="sale">
              ซื้อ {product.quantityDiscount.minQty}+ ลด{" "}
              {formatPercent(product.quantityDiscount.percent)}
            </Badge>
          )}
          {soldOut && <Badge variant="sold">สินค้าหมด</Badge>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs text-n-500">
          {categoryLabel(product.category)}
        </span>
        <Link
          href={`/shop/${product.id}`}
          className="line-clamp-2 font-display text-base font-semibold text-ink transition-colors hover:text-amber-600"
        >
          {product.title}
        </Link>
        <span className="text-xs text-n-500">
          โดย {product.seller.displayName ?? "ไม่ระบุชื่อ"}
        </span>

        <div className="mt-auto pt-3">
          <div className="font-display text-lg font-bold text-ink">
            {formatTHB(product.price)}
          </div>
          <AddToCartButton
            productId={product.id}
            disabled={soldOut}
            label={soldOut ? "สินค้าหมด" : "เพิ่มลงตะกร้า"}
            block
            className="mt-3"
          />
        </div>
      </div>
    </article>
  )
}
