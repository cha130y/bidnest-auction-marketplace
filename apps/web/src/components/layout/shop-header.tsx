"use client"

import { SiteHeader } from "@/components/layout/site-header"
import { useCart } from "@/components/cart/cart-provider"

/**
 * Wires Dev 1's presentational `SiteHeader` to the live cart badge. Route-
 * based nav state (Auction vs E-commerce) is handled inside `SiteHeader`'s
 * own gavel nav via `usePathname`, so this wrapper only owns the cart count.
 */
export function ShopHeader() {
  const { itemCount } = useCart()

  return <SiteHeader cartCount={itemCount} />
}
