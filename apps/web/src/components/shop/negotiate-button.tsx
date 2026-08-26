"use client"

import { OpenConversationButton } from "@/components/chat/open-conversation-button"
import { useCart } from "@/components/cart/cart-provider"
import { startProductConversation } from "@/lib/api/products"

/**
 * PROD-006 / CHAT-001 — opens (or reuses) the buyer↔seller thread for this
 * listing, then goes straight to it.
 *
 * The seller's `negotiationFloor` is never shown here — it stays owner-only
 * (SRS §6), the buyer just gets the thread.
 */
export function NegotiateButton({ productId }: { productId: string }) {
  const { isAuthenticated, isAuthReady } = useCart()

  return (
    <OpenConversationButton
      label="ต่อรองราคากับผู้ขาย"
      open={() => startProductConversation(productId)}
      isAuthenticated={isAuthenticated}
      authReady={isAuthReady}
    />
  )
}
