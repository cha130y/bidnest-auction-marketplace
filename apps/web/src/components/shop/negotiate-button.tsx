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
 *
 * Labelled for what the button does rather than for what the buyer might do
 * next: it opens a chat thread, and nothing about it is specific to haggling.
 * The old "ต่อรองราคากับผู้ขาย" promised a price negotiation that the thread
 * does not itself provide — the AI counter-offer form further down the panel
 * is the part that does — and it read as a different feature from the auction
 * side's button, which is the same component opening the same kind of thread.
 */
export function NegotiateButton({ productId }: { productId: string }) {
  const { isAuthenticated, isAuthReady } = useCart()

  return (
    <OpenConversationButton
      label="ทักหาผู้ขาย"
      open={() => startProductConversation(productId)}
      isAuthenticated={isAuthenticated}
      authReady={isAuthReady}
    />
  )
}
