import { BadRequestException } from '@nestjs/common';
import type { AuctionStatus } from '../../../generated/prisma/enums';

/** The two facts that decide whether a seller may still change an auction. */
export type AuctionChangeState = {
  status: AuctionStatus;
  bidCount: number;
};

/**
 * AUC-006 — a seller may edit or cancel only while the auction is DRAFT or
 * SCHEDULED. This is written as an allow-list for the same reason the public
 * lookup is: a status added later should be closed to seller edits until
 * somebody decides otherwise.
 */
const SELLER_CHANGEABLE: AuctionStatus[] = ['DRAFT', 'SCHEDULED'];

function assertSellerMayChange(
  auction: AuctionChangeState,
  verb: 'edited' | 'cancelled'
): void {
  if (!SELLER_CHANGEABLE.includes(auction.status)) {
    throw new BadRequestException(
      `An auction in ${auction.status} can no longer be ${verb} by its seller`
    );
  }

  // "or once bidding has happened" — SCHEDULED should never hold bids today,
  // but the rule is about the bids, not about how they got there.
  if (auction.bidCount > 0) {
    throw new BadRequestException(
      `An auction that has already received bids can no longer be ${verb}`
    );
  }
}

export function assertAuctionIsEditable(auction: AuctionChangeState): void {
  assertSellerMayChange(auction, 'edited');
}

export function assertAuctionIsCancellable(auction: AuctionChangeState): void {
  assertSellerMayChange(auction, 'cancelled');
}
