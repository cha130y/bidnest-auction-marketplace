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
  /**
   * `outstandingCounter` is the amount this negotiation last proposed to this
   * buyer for this listing, or null on a first offer.
   *
   * Without it the negotiation had no way to end in the buyer's favour. Every
   * counter is the midpoint between the offer and the asking price, so it is
   * always below the asking price — and the only other route to ACCEPTED is
   * offering the asking price or more. Meeting a counter therefore produced
   * another counter, halfway again, and the sequence approaches the asking
   * price without ever reaching it: a buyer could negotiate for ever and never
   * be allowed to pay less than the sticker.
   *
   * Taking one's own proposal seriously is what closes it. The rule the SRS
   * actually fixes is the floor — "จะไม่มีทางอนุมัติราคาที่ต่ำกว่าราคาต่ำสุดที่
   * ตั้งไว้เด็ดขาด" — and that is still checked first and independently here,
   * so an accepted counter can never fall below it either.
   */
  decide(
    offerAmount: number,
    floor: number,
    currentPrice: number,
    quantity: number,
    stockQty: number,
    outstandingCounter: number | null = null
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

    // Only ever reached above the floor, because that check is above this one.
    if (outstandingCounter !== null && offerAmount >= outstandingCounter) {
      return { decision: 'ACCEPTED', counterAmount: null };
    }

    const counter = Math.round(((offerAmount + currentPrice) / 2) * 100) / 100;
    return { decision: 'COUNTERED', counterAmount: counter };
  }
}
