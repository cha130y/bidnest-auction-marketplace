import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * ADM-001 — Auction oversight (owner: Dev 4)
 *
 * `cancelAuction` ต้องทำใน `$transaction` เดียวทั้งหมด:
 *   1. auctions.status = CANCELLED + เก็บ cancellationReason + endedAt
 *   2. auction_events แถวใหม่ eventType = CANCELLED
 *   3. admin_actions แถวใหม่ actionType = CANCEL_AUCTION + auctionId + note (ADM-004)
 *   4. notifications ให้ผู้ขายและผู้ที่เคยประมูลไว้ type = AUCTION_CANCELLED (NOT-004)
 *
 * หลัง transaction commit แล้วจึง broadcast ผ่าน WebSocket room ของ auction นั้น
 * (SRS §6 — event ต้องมาจากผลลัพธ์ transaction ที่ถูกต้องเท่านั้น)
 */
@Injectable()
export class AdminAuctionsService {
  listAuctions(): never {
    throw new NotImplementedException('ADM-001 listAuctions');
  }

  cancelAuction(auctionId: string): never {
    throw new NotImplementedException(
      `ADM-001 cancelAuction (auctionId=${auctionId})`,
    );
  }
}
