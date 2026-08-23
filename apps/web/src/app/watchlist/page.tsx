import type { Metadata } from "next"

import { WatchlistView } from "@/components/auction/watchlist-view"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"

export const metadata: Metadata = {
  title: "รายการที่ติดตาม · BidNest",
  description: "การประมูลที่คุณติดตามไว้ พร้อมเวลาปิดและผลการประมูล",
}

/**
 * WAT-002 — the auctions somebody is following.
 *
 * The shell is server-rendered; the list itself cannot be. `GET /watchlist`
 * needs a token, and the token lives in localStorage, so `authHeader()` is
 * empty during SSR and a server read would 401 for everybody. `WatchlistView`
 * does the reading once the browser has it.
 *
 * Dev 1's header has a `Heart` with a `wishlistActive` prop already, but it
 * links nowhere yet. Pointing it here is a one-line change to `site-header.tsx`
 * — their file, so it is left for them rather than made in passing.
 */
export default function WatchlistPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader activeHref="/watchlist" />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <header className="py-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              รายการที่ติดตาม
            </h1>
            <p className="mt-2 text-base text-n-600">
              การประมูลที่คุณกดติดตามไว้ จะแจ้งเตือนเมื่อมีคนเสนอราคาแซง
              และเมื่อการประมูลจบลง
            </p>
          </header>

          <WatchlistView />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
