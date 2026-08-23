import { apiFetch } from "@/lib/api/client"
import type {
  Auction,
  DraftValidation,
  OwnedDraftList,
  OwnerAuction,
} from "@/lib/api/types"

/** Mirrors CreateAuctionDraftDto in apps/api/src/auction/dtos/. */
export type CreateDraftInput = {
  title: string
  description: string
  categoryId: string
  condition: "NEW" | "USED"
  startingPrice: number
  minBidIncrement: number
  /** AUC-003 — the seller's alone. Optional on a draft; the publish gate decides if it is required. */
  reservePrice?: number
  scheduledStartAt?: string
  scheduledEndAt?: string
  imageUrls?: string[]
}

/**
 * AUC-001 — starts a draft.
 *
 * Only what the row cannot be written without is required. The schedule, the
 * images and the reserve are the publish gate's business (AUC-002), so a
 * half-finished draft still saves — which is the point of a draft.
 */
export function createDraft(input: CreateDraftInput) {
  return apiFetch<OwnerAuction>("/auctions/drafts", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** AUC-001 — the seller's own drafts. Needs a token; nothing else may read them. */
export function listOwnDrafts() {
  return apiFetch<OwnedDraftList>("/auctions/drafts")
}

export function getOwnDraft(id: string) {
  return apiFetch<OwnerAuction>(`/auctions/drafts/${id}`)
}

/**
 * AUC-002 — what is still missing before this can be published.
 *
 * Asked for rather than worked out on screen: the gate that refuses a publish
 * is the same one that answers here, so the form cannot promise a publish the
 * API would refuse, or block one it would allow.
 */
export function validateDraft(id: string) {
  return apiFetch<DraftValidation>(`/auctions/drafts/${id}/validation`)
}

/**
 * AUC-004 — the draft as a buyer would see it.
 *
 * Returns the *public* shape, so `reservePrice` is absent by construction
 * rather than by being filtered here — which is exactly what makes it a
 * preview worth having.
 *
 * A read: the draft keeps its status.
 */
export function previewDraft(id: string) {
  return apiFetch<Auction>(`/auctions/drafts/${id}/preview`)
}

/** AUC-004 — publishes. SCHEDULED if the start is ahead, ACTIVE if it has passed. */
export function publishDraft(id: string) {
  return apiFetch<OwnerAuction>(`/auctions/drafts/${id}/publish`, {
    method: "POST",
  })
}

/** AUC-006 — edits. What may still change depends on the status, and the API decides. */
export function updateAuction(id: string, input: Partial<CreateDraftInput>) {
  return apiFetch<OwnerAuction>(`/auctions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

/** AUC-006 — withdraws the seller's own auction. */
export function cancelOwnAuction(id: string, reason: string) {
  return apiFetch<OwnerAuction>(`/auctions/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}
