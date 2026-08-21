"use client"

import { usePathname } from "next/navigation"

import { SiteHeader, defaultNavLinks } from "@/components/layout/site-header"
import { useCart } from "@/components/cart/cart-provider"

/**
 * Wires Dev 1's presentational `SiteHeader` to the two pieces of live state it
 * takes: the current route and the cart badge. Kept separate so the header
 * component itself stays free of data concerns.
 */
export function ShopHeader() {
  const pathname = usePathname()
  const { itemCount } = useCart()

  // `/shop/<id>` should still light up the "Shop" link, so match on prefix and
  // keep the most specific hit — "/" would otherwise match everything.
  const activeHref = defaultNavLinks
    .filter(
      (link) => pathname === link.href || pathname.startsWith(`${link.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return <SiteHeader activeHref={activeHref} cartCount={itemCount} />
}
