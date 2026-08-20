import { BadRequestException } from '@nestjs/common';
import type { AuctionStatus } from '../../../generated/prisma/enums';
import {
  assertAuctionIsCancellable,
  assertAuctionIsEditable
} from './assert-seller-can-change.util';

const auction = (status: AuctionStatus, bidCount = 0) => ({
  status,
  bidCount
});

describe('assertSellerCanChange (AUC-006)', () => {
  // Both guards enforce the same rule, so both are checked against every case
  const guards = [
    ['edit', assertAuctionIsEditable],
    ['cancel', assertAuctionIsCancellable]
  ] as const;

  describe.each(guards)('%s', (_verb, assertAllowed) => {
    it('allows a DRAFT with no bids', () => {
      expect(() => assertAllowed(auction('DRAFT'))).not.toThrow();
    });

    it('allows a SCHEDULED auction with no bids', () => {
      expect(() => assertAllowed(auction('SCHEDULED'))).not.toThrow();
    });

    it('refuses an ACTIVE auction', () => {
      expect(() => assertAllowed(auction('ACTIVE'))).toThrow(
        BadRequestException
      );
    });

    it('refuses one that has already ended', () => {
      expect(() => assertAllowed(auction('SOLD'))).toThrow(BadRequestException);
      expect(() => assertAllowed(auction('UNSOLD'))).toThrow(
        BadRequestException
      );
    });

    it('refuses one that is already cancelled', () => {
      expect(() => assertAllowed(auction('CANCELLED'))).toThrow(
        BadRequestException
      );
    });

    // "or once bidding has happened" — the rule is about the bids themselves,
    // not about which status let them in
    it('refuses a SCHEDULED auction that somehow holds bids', () => {
      expect(() => assertAllowed(auction('SCHEDULED', 1))).toThrow(
        BadRequestException
      );
    });

    it('refuses a DRAFT that somehow holds bids', () => {
      expect(() => assertAllowed(auction('DRAFT', 3))).toThrow(
        BadRequestException
      );
    });

    it('names the status in the message so the seller knows why', () => {
      expect(() => assertAllowed(auction('ACTIVE'))).toThrow(/ACTIVE/);
    });
  });
});
