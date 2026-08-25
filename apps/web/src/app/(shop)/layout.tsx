import { CartProvider } from "@/components/cart/cart-provider"
import { ShopHeader } from "@/components/layout/shop-header"
import { SiteFooter } from "@/components/layout/site-footer"
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider"

/**
 * Storefront chrome for every e-commerce route. Deliberately a route-group
 * layout rather than the root one: other modules (admin, auth) render without
 * the shop header/footer, and keeping it here leaves `app/layout.tsx` free of
 * module-specific markup.
 *
 * No `Providers` here. `app/layout.tsx` already mounts it around everything,
 * and a second one built a second `QueryClient` — `useState(() => new
 * QueryClient())`, so one cache per mount. A route group's layout only mounts
 * when the group is entered, which made every trip from outside the group into
 * it start from an empty cache: the cart, the badges and the unread dot all
 * refetched, so `/cart` flashed its skeleton every single time it was opened
 * from the header, while moving between two pages that shared a cache did not.
 * It also meant a listing followed on one side of the app did not show as
 * followed on the other until something happened to refetch.
 */
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <CartProvider>
      {/* Sits beside CartProvider for the same reason: the header needs one
          shared count, not one read per component that shows it. */}
      <WatchlistProvider>
        <div className="flex min-h-full flex-1 flex-col bg-n-100">
          <ShopHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </WatchlistProvider>
    </CartProvider>
  )
}
