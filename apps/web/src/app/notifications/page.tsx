import type { Metadata } from "next"

import { NotificationList } from "@/components/notification/notification-list"
import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"

export const metadata: Metadata = {
  title: "การแจ้งเตือน · BidNest",
  description: "การแจ้งเตือนของคุณ ทั้งการประมูล คำสั่งซื้อ และข้อความ",
}

/**
 * NOT-001..004 — everything addressed to the viewer.
 *
 * The shell is server-rendered; the list is not, for the reason the watchlist
 * is not: `GET /notifications` needs a token, and the token lives in
 * localStorage, so a server read would 401 for everybody.
 *
 * The page is not auction-only. All eight notification kinds share one table
 * and one route so the badge stays a single number, and the API writes each
 * row's own `title` and `message` — so the list renders orders and messages
 * correctly without this module knowing anything about them.
 */
export default function NotificationsPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-250 px-4 pb-16 md:px-6">
          <header className="py-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              การแจ้งเตือน
            </h1>
            <p className="mt-2 text-base text-n-600">
              เมื่อมีคนเสนอราคาแซง เมื่อคุณชนะการประมูล
              และเมื่อการประมูลที่ติดตามไว้จบลง
            </p>
          </header>

          <NotificationList />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
