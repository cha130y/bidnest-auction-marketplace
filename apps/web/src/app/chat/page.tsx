import type { Metadata } from "next"

import { ConversationList } from "@/components/chat/conversation-list"
import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"

export const metadata: Metadata = {
  title: "ข้อความ · BidNest",
  description: "บทสนทนาต่อรองราคากับผู้ซื้อและผู้ขาย",
}

/**
 * CHAT-003 — the inbox. Not server-rendered, same reason /notifications is
 * not: `GET /conversations` needs the session's access token, which only
 * exists client-side.
 */
export default function ChatPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-250 px-4 pb-16 md:px-6">
          <header className="py-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              ข้อความ
            </h1>
            <p className="mt-2 text-base text-n-600">
              บทสนทนาต่อรองราคากับผู้ซื้อและผู้ขาย
            </p>
          </header>

          <ConversationList />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
