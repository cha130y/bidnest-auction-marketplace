import { apiFetch, buildQuery } from "@/lib/api/client"
import type { Paginated } from "@/lib/api/types"

// ── CHAT-001..003 — buyer/seller negotiation threads (owner: Dev 5) ────────

export type ConversationRole = "BUYER" | "SELLER"

/** CHAT-004 — a thread is about a product or an auction, never both. */
export type ConversationListing = {
  kind: "PRODUCT" | "AUCTION"
  id: string
  title: string
  imageUrl: string | null
}

export type ConversationSummary = {
  id: string
  role: ConversationRole
  listing: ConversationListing
  counterpart: { id: string; displayName: string | null }
  lastMessage: { body: string; sentByMe: boolean; at: string } | null
  unreadCount: number
  updatedAt: string
}

export type ChatMessage = {
  id: string
  body: string
  sentByMe: boolean
  createdAt: string
  readAt: string | null
}

/** CHAT-003 — every thread the viewer is in, buying and selling combined. */
export function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch<ConversationSummary[]>("/conversations")
}

/**
 * CHAT-002 — reading a page marks the counterpart's messages on it as read,
 * so this is not safe to call speculatively (e.g. to prefetch a badge count).
 */
export function listMessages(
  conversationId: string,
  params: { page?: number; limit?: number } = {}
): Promise<Paginated<ChatMessage>> {
  return apiFetch<Paginated<ChatMessage>>(
    `/conversations/${conversationId}/messages${buildQuery(params)}`
  )
}

export function sendMessage(
  conversationId: string,
  body: string
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })
}

/** CHAT-004 — the auction-side counterpart to startProductConversation. */
export function startAuctionConversation(auctionId: string) {
  return apiFetch<{ id: string }>(`/auctions/${auctionId}/conversations`, {
    method: "POST",
  })
}

// ── CHAT-004 — seller's own auto-reply, sent once a buyer's order for one of
// their listings is placed ──────────────────────────────────────────────────

export function fetchAutoReplyMessage(): Promise<{ message: string | null }> {
  return apiFetch<{ message: string | null }>("/users/me/auto-reply")
}

export function updateAutoReplyMessage(
  message: string | null
): Promise<{ message: string | null }> {
  return apiFetch<{ message: string | null }>("/users/me/auto-reply", {
    method: "PATCH",
    body: JSON.stringify({ message }),
  })
}
