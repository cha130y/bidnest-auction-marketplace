import Providers from "@/app/providers"
import { CartProvider } from "@/components/cart/cart-provider"
import { ShopHeader } from "@/components/layout/shop-header"
import { SiteFooter } from "@/components/layout/site-footer"

/**
 * Storefront chrome for every e-commerce route. Deliberately a route-group
 * layout rather than the root one: other modules (admin, auth) render without
 * the shop header/footer, and keeping it here leaves `app/layout.tsx` free of
 * module-specific markup.
 */
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <CartProvider>
        <div className="flex min-h-full flex-1 flex-col bg-n-100">
          <ShopHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </CartProvider>
    </Providers>
  )
}
