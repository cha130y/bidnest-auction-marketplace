import { notFound } from "next/navigation"

import { getArena } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"
import type { AuctionArena } from "@/lib/api/types"

/**
 * AUC-005 / LIV-002 — the arena as a signed-out visitor sees it, for the two
 * server-rendered pages that show one: the auction itself and its result.
 *
 * Reads the arena rather than the auction alone because it carries the same
 * auction plus everything that moves — the leader, the latest bids, how close
 * to the deadline it is, and the result once there is one — in one round trip.
 *
 * AUC-003 shaped what reaches the browser: `GET /auctions/:id` answers the
 * seller's own request with `toOwnerAuction`, which carries `reservePrice`;
 * the arena's `auction` is the public shape and has no such field, so no page
 * built on this can render the reserve even by accident.
 */
export async function readArena(id: string): Promise<AuctionArena> {
  try {
    return await getArena(id)
  } catch (error) {
    // A draft, a cancelled auction, a deleted one, or an id that never existed
    // all arrive here as 404 — the API deliberately does not distinguish, so
    // neither does this.
    //
    // 400 lands here too, and belongs with them: the route's only parameter is
    // the id, and `ParseUUIDPipe` rejects anything that is not a uuid before
    // the handler runs. From a visitor's side `/auctions/not-a-uuid` is an
    // auction that does not exist, so it gets the same page. Letting the 400
    // through instead rendered a 500 — which claims this server broke, and
    // would wake somebody up over a mistyped URL.
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
    ) {
      notFound()
    }
    throw error
  }
}
