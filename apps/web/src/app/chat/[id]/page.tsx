import type { Metadata } from "next"

import { ConversationThread } from "@/components/chat/conversation-thread"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"

export const metadata: Metadata = {
  title: "บทสนทนา · BidNest",
}

/**
 * CHAT-002 — one thread. `id` is trusted no further than the API trusts it:
 * an id that is not this viewer's conversation comes back 404 either way
 * (assertParticipant in chat.service.ts), which ConversationThread renders
 * as-is.
 */
export default async function ConversationPage({
  params,
}: PageProps<"/chat/[id]">) {
  const { id } = await params

  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-250 px-4 py-8 md:px-6">
          <ConversationThread conversationId={id} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
