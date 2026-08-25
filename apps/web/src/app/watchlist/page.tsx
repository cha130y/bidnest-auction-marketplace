import type { Metadata } from "next"

import { CartProvider } from "@/components/cart/cart-provider"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { WatchlistView } from "@/components/auction/watchlist-view"
import { ProductWatchlistView } from "@/components/shop/product-watchlist-view"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata: Metadata = {
  title: "รายการที่ติดตาม · BidNest",
  description: "การประมูลและสินค้าที่คุณติดตามไว้",
}

/**
 * WAT-002, and the listings alongside it.
 *
 * One page, two tabs, two endpoints. The lists are separate tables with
 * separate shapes — an auction has a countdown and a result, a listing has
 * stock and a price — and merging them server-side would mean inventing a
 * discriminator for a client that already knows which tab it is drawing.
 * Where they belong together is here, on screen.
 *
 * The shell is server-rendered; neither list can be. Both endpoints need a
 * token, and the token lives in localStorage, so `authHeader()` is empty
 * during SSR and a server read would 401 for everybody. The two views do the
 * reading once the browser has it.
 */
export default function WatchlistPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <header className="py-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              รายการที่ติดตาม
            </h1>
            <p className="mt-2 text-base text-n-600">
              สิ่งที่คุณกดหัวใจไว้ — การประมูลจะแจ้งเตือนเมื่อมีคนเสนอราคาแซง
              และเมื่อการประมูลจบลง
            </p>
          </header>

          {/* Auctions first: they are the ones that expire, so they are the
              ones somebody opening this page is more likely to have come for. */}
          <Tabs defaultValue="auctions">
            <TabsList>
              <TabsTrigger value="auctions">การประมูล</TabsTrigger>
              <TabsTrigger value="products">สินค้า</TabsTrigger>
            </TabsList>

            <TabsContent value="auctions">
              <WatchlistView />
            </TabsContent>

            <TabsContent value="products">
              {/* `ProductCard`'s add-to-cart button reads `useCart()`, which
                  only the `(shop)` route group's layout provides. This page
                  lives outside that group — it is shared with the auction
                  module — so the listings tab brings its own, exactly as the
                  home page's picks section does. The auctions tab needs none. */}
              <CartProvider>
                <ProductWatchlistView />
              </CartProvider>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}