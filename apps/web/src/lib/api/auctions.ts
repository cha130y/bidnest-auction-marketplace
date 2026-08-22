import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  Auction,
  AuctionSection,
  OwnerAuction,
  Paginated,
} from "@/lib/api/types"

/** Mirrors ListAuctionsDto in apps/api/src/auction/dtos/list-auctions.dto.ts */
export type AuctionListParams = {
  /**
   * Omitted is the AUC-008 hot list. A name the API does not know is a 400
   * rather than a quiet fall back, so a typo surfaces instead of silently
   * rendering the wrong list.
   */
  section?: AuctionSection
  page?: number
  limit?: number
}

/** AUC-008 — the public auction list, one section at a time. */
export function listAuctions(params: AuctionListParams = {}) {
  return apiFetch<Paginated<Auction>>(`/auctions${buildQuery({ ...params })}`)
}

/**
 * AUC-005 — `@Public()`, so a signed-out visitor may read it. The seller gets
 * `reservePrice` back when the request carries their own token, which is why
 * this returns the owner type. Buyer UI must ignore that field.
 *
 * This read also settles an auction whose time is up (AUC-007), so the status
 * it returns is current rather than merely stored.
 */
export function getAuction(id: string) {
  return apiFetch<OwnerAuction>(`/auctions/${id}`)
}
