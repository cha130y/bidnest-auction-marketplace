"use client"

import { OpenConversationButton } from "@/components/chat/open-conversation-button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { startAuctionConversation } from "@/lib/api/chat"

/**
 * CHAT-004 — the auction-side counterpart to shop's NegotiateButton.
 *
 * `useAuthToken()` rather than `useCart()`: this renders on /auctions/[id],
 * which sits outside the (shop) layout's `CartProvider`.
 */
export function AuctionNegotiateButton({ auctionId }: { auctionId: string }) {
  const { token, ready } = useAuthToken()

  return (
    <OpenConversationButton
      label="ทักผู้ขาย"
      open={() => startAuctionConversation(auctionId)}
      isAuthenticated={!!token}
      authReady={ready}
    />
  )
}
