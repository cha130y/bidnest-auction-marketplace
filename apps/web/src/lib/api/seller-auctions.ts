import { API_BASE_URL, ApiError, apiFetch, buildQuery } from "@/lib/api/client"
import { authHeader } from "@/lib/api/auth/token"
import type {
  Auction,
  DraftValidation,
  OwnedDraftList,
  OwnerAuction,
  OwnerAuctionStatus,
  Paginated,
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

/**
 * AUC-006 — everything the seller has, in any state.
 *
 * The drafts route above is the narrow view of the same rows; this is the one
 * the seller's own screen is built on, because a published auction leaves the
 * drafts list and has to be findable somewhere.
 *
 * Paged, unlike the drafts list: a seller accumulates finished auctions for as
 * long as they sell, and there is no natural ceiling to fall back on.
 */
export function listOwnAuctions(
  params: { status?: OwnerAuctionStatus; page?: number; limit?: number } = {}
) {
  return apiFetch<Paginated<OwnerAuction>>(
    `/auctions/mine${buildQuery({
      status: params.status,
      page: params.page,
      limit: params.limit,
    })}`
  )
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

/**
 * AUC-001 — uploads one picture to a draft.
 *
 * Sent as multipart, so this bypasses `apiFetch`: that helper sets
 * `Content-Type: application/json` on everything, and a multipart body needs
 * the browser to set its own header with the boundary it generated. The token
 * still comes from the same place.
 *
 * Answers 503 when the server has no image storage configured — which is a
 * deployment fact rather than a mistake by whoever pressed the button, so it
 * is worth saying so rather than showing a generic failure.
 */
export async function uploadDraftImage(
  auctionId: string,
  file: File,
  altText?: string
): Promise<OwnerAuction> {
  const form = new FormData()
  form.append("image", file)
  if (altText) form.append("altText", altText)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/auctions/${auctionId}/images`, {
      method: "POST",
      headers: await authHeader(),
      body: form,
    })
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง")
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `อัปโหลดไม่สำเร็จ (${response.status})`
    throw new ApiError(response.status, message, body)
  }

  return body as OwnerAuction
}

/** AUC-001 — removes one picture from a draft. */
export function removeDraftImage(auctionId: string, imageId: string) {
  return apiFetch<OwnerAuction>(
    `/auctions/${auctionId}/images/${imageId}`,
    { method: "DELETE" }
  )
}
