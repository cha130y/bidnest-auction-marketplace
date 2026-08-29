import Link from "next/link"

import { ProductImage } from "@/components/shop/product-image"
import { formatTHB, listingHref } from "@/lib/format"
import type { OrderItem } from "@/lib/api/types"

/**
 * One line of an order: what it was, what each cost, what the line came to.
 *
 * Extracted because the buyer's screen and the seller's screen had this markup
 * byte for byte, and a line can now be a won auction as well as a shop
 * product — which changes where it links. Two copies would have meant two
 * chances to leave one of them pointing every auction at `/shop/:id`, where
 * the page 404s.
 */
export function OrderLineRow({ item }: { item: OrderItem }) {
  const { listing } = item

  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      {listing ? (
        <Link href={listingHref(listing)} className="shrink-0">
          <ProductImage
            src={listing.imageUrl}
            alt={listing.title}
            className="size-20 rounded-r3 object-cover"
          />
        </Link>
      ) : (
        <ProductImage
          src={null}
          alt=""
          className="size-20 rounded-r3 object-cover"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {listing ? (
          <Link
            href={listingHref(listing)}
            className="line-clamp-2 font-semibold text-ink transition-colors hover:text-amber-600"
          >
            {listing.title}
          </Link>
        ) : (
          /* Only reachable from a row with neither a product nor an auction,
             which checkout does not write. Said plainly rather than left blank:
             the price beside it is real and was charged, so a receipt that
             showed nothing here would look like the bug. */
          <span className="line-clamp-2 font-semibold text-n-500">
            รายการนี้ไม่มีข้อมูลสินค้าแล้ว
          </span>
        )}
        <span className="text-sm text-n-500">
          {formatTHB(item.unitPrice)} × {item.quantity}
        </span>
      </div>

      <span className="font-display font-bold text-ink">
        {formatTHB(item.lineTotal)}
      </span>
    </li>
  )
}