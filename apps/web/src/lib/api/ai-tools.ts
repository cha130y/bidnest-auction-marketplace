import { apiFetch } from "@/lib/api/client"

// ── AI-002 — AI Price Estimator (Optional, owner: Dev 5) ────────────────────
// Standalone file rather than adding to Dev4's seller-auctions.ts — same
// "own file per requirement owner" convention as lib/api/admin.ts.

export type PriceEstimate = {
  suggestedStartingPrice: number
  estimatedClosingRangeLow: number
  estimatedClosingRangeHigh: number
  reason: string
}

/**
 * AI-002 — asks Gemini to look at the draft's own uploaded photos (must have
 * at least one) and suggest a starting price. Advisory only: nothing here
 * writes to the draft, the seller still decides what to type into the price
 * field (see PriceSuggestionButton for the "use this" auto-fill).
 *
 * Rate-limited server-side (3 per 10 min per user) — surface the 429/400
 * message from ApiError as-is, it is already in Thai.
 */
export function requestPriceEstimate(auctionId: string): Promise<PriceEstimate> {
  return apiFetch<PriceEstimate>(`/auctions/drafts/${auctionId}/price-estimate`, {
    method: "POST",
  })
}

// ── AI-003 — AI Negotiator (Optional, owner: Dev 5) ─────────────────────────

export type OfferDecision = "ACCEPTED" | "COUNTERED" | "REJECTED"

export type OfferResult = {
  id: string
  decision: OfferDecision
  counterAmount: number | null
  /** Only set when decision is ACCEPTED — 15 minutes from now. */
  expiresAt: string | null
  /**
   * Only set when decision is ACCEPTED. Hand this to Dev3's checkout flow
   * (CART-004) — it is single-use and expires with `expiresAt`.
   */
  acceptToken: string | null
}

/**
 * AI-003 — propose a price/quantity for a listing that has a negotiation
 * floor set (PROD-006). Decides immediately; there is no "pending" state.
 *
 * Server enforces a 5-minute cooldown and a 3-attempts/24h cap per
 * (buyer, product) — both come back as a 400 with a Thai-readable message via
 * ApiError, same as the price estimator's rate limit.
 */
export function createOffer(
  productId: string,
  quantity: number,
  offerAmount: number
): Promise<OfferResult> {
  return apiFetch<OfferResult>(`/products/${productId}/offers`, {
    method: "POST",
    body: JSON.stringify({ quantity, offerAmount }),
  })
}
