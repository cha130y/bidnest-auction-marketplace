import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  Auction,
  AuctionArena,
  AuctionLobby,
  AuctionSection,
  AuctionStats,
  OwnerAuction,
  Paginated,
  PlacedBid,
  PublicBid,
} from "@/lib/api/types"

/** Mirrors ListAuctionsDto in apps/api/src/auction/dtos/list-auctions.dto.ts */
export type AuctionListParams = {
  /**
   * Omitted is the AUC-008 hot list. A name the API does not know is a 400
   * rather than a quiet fall back, so a typo surfaces instead of silently
   * rendering the wrong list.
   */
  section?: AuctionSection
  /**
   * AUC-008 — the same four the catalogue takes, and the same shapes, so one
   * filter panel can drive both lists and a URL means the same thing on
   * either. `categoryIds` goes over the wire comma-joined by `buildQuery`,
   * which is one of the two forms `ListAuctionsDto` accepts.
   *
   * `minPrice`/`maxPrice` are matched against whichever price the auction is
   * showing — its current price once somebody has bid, its starting price
   * before that — so the range means what the card says.
   */
  q?: string
  categoryIds?: string[]
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
}

/** AUC-008 — the public auction list, one section at a time. */
export function listAuctions(params: AuctionListParams = {}) {
  return apiFetch<Paginated<Auction>>(`/auctions${buildQuery({ ...params })}`)
}

/**
 * The three numbers under the home page hero. `@Public()`, one round trip,
 * and counted in the database — the list endpoint caps `limit` at 100, so
 * totalling a page of it would go quietly wrong once there are more auctions
 * than that.
 */
export function getAuctionStats() {
  return apiFetch<AuctionStats>("/auctions/stats")
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

/**
 * LIV-001 — the lobby: the auction, how many people are in it, how long until
 * it starts or ends, and whether the viewer has joined.
 *
 * `@Public()`. A token is honoured when one is sent, which is the only thing
 * that fills in `you` — a signed-out visitor gets null there and everything
 * else the same.
 */
export function getLobby(auctionId: string) {
  return apiFetch<AuctionLobby>(`/auctions/${auctionId}/lobby`)
}

/**
 * LIV-002 / LIV-003 / LIV-004 — the arena: everything the lobby has, plus who
 * is leading, the latest bids, how close to the deadline it is, and the result
 * once there is one.
 *
 * A separate read from the lobby rather than fields bolted onto it, because a
 * lobby is looked at by people waiting for an auction with no bids to show.
 */
export function getArena(auctionId: string) {
  return apiFetch<AuctionArena>(`/auctions/${auctionId}/arena`)
}

/** Mirrors ListBidHistoryDto in apps/api/src/bid/dtos/list-bid-history.dto.ts */
export type BidHistoryParams = {
  page?: number
  limit?: number
}

/**
 * BID-005 — the full history, oldest first, paged. Public like the auction it
 * belongs to; a token only decides which rows come back marked `isYours`.
 *
 * The arena already carries the latest handful, so this is for anyone who
 * wants to read past them.
 */
export function listBidHistory(
  auctionId: string,
  params: BidHistoryParams = {}
) {
  return apiFetch<Paginated<PublicBid>>(
    `/auctions/${auctionId}/bids${buildQuery({ ...params })}`
  )
}

/** Mirrors PlaceBidDto in apps/api/src/bid/dtos/place-bid.dto.ts */
export type PlaceBidInput = {
  amount: number
  /**
   * BID-002 — the same value replays the first bid instead of placing another.
   * Generate one per attempt and keep it across retries of that attempt.
   */
  clientRequestId: string
}

/**
 * BID-001 — places a bid. Needs a token, and `@Roles('USER')`: admins moderate
 * the market rather than taking part in it (SRS 2).
 *
 * Returns the bidder's own row, not the public shape — see `PlacedBid`.
 */
export function placeBid(auctionId: string, input: PlaceBidInput) {
  return apiFetch<PlacedBid>(`/auctions/${auctionId}/bids`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/**
 * LIV-001 — takes part in an auction. Joining is not bidding: a seller may
 * join their own auction, and so may anybody who never bids.
 *
 * Idempotent — joining twice leaves one row and the count does not jump.
 */
export function joinAuction(auctionId: string) {
  return apiFetch<{ auctionId: string; joined: boolean; participantCount: number }>(
    `/auctions/${auctionId}/participants`,
    { method: "POST" }
  )
}

/** LIV-001 — leaves the auction. The row stays as LEFT rather than vanishing. */
export function leaveAuction(auctionId: string) {
  return apiFetch<{ auctionId: string; joined: boolean; participantCount: number }>(
    `/auctions/${auctionId}/participants`,
    { method: "DELETE" }
  )
}
