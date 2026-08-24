import { Injectable } from '@nestjs/common';
import type { OfferDecision } from '../../generated/prisma/enums';

export interface NegotiationResult {
  decision: OfferDecision;
  counterAmount: number | null;
}

/**
 * AI-003 — AI Negotiator (Optional, owner: Dev 5)
 *
 * Pure decision logic, kept apart from the facade so the pricing rule can be
 * unit tested without a database. Never let a caller construct one of these
 * amounts on the client — the floor is a secret the buyer must never see, so
 * comparing it has to happen here on the server.
 *
 * SRS says COUNTER carries "a counter-offer amount the system proposes" but
 * does not name a formula. This averages the offer with the current asking
 * price (not the floor) so the counter always sits between what the buyer
 * offered and what the seller is asking — averaging against the floor
 * instead could produce a counter *below* the buyer's own offer whenever the
 * offer already sits close to the asking price, which would make no sense
 * as a counter-offer.
 */
@Injectable()
export class NegotiatorService {
  decide(
    offerAmount: number,
    floor: number,
    currentPrice: number,
    quantity: number,
    stockQty: number
  ): NegotiationResult {
    if (quantity > stockQty) {
      return { decision: 'REJECTED', counterAmount: null };
    }

    if (offerAmount < floor) {
      return { decision: 'REJECTED', counterAmount: null };
    }

    if (offerAmount >= currentPrice) {
      return { decision: 'ACCEPTED', counterAmount: null };
    }

    const counter = Math.round(((offerAmount + currentPrice) / 2) * 100) / 100;
    return { decision: 'COUNTERED', counterAmount: counter };
  }
}
