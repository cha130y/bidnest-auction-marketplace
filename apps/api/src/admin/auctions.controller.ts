import { Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminAuctionsService } from './auctions.service';

/**
 * ADM-001 — Auction oversight (owner: Dev 4)
 *
 * ต่างจาก AUC-006 ที่ผู้ขายยกเลิกได้เฉพาะสถานะ DRAFT/SCHEDULED —
 * admin ยกเลิกประมูลที่ ACTIVE ได้ด้วย (การยกเลิกฉุกเฉิน)
 *
 * TODO(Dev 4): เมื่อ AUTH-008 พร้อม ใส่ guard ที่ระดับ class
 *   `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`
 */
@Controller('admin/auctions')
export class AdminAuctionsController {
  constructor(private readonly adminAuctionsService: AdminAuctionsService) {}

  /** query: cursor?, limit?, status? (AuctionStatus) */
  @Get()
  listAuctions() {
    return this.adminAuctionsService.listAuctions();
  }

  /** body: { reason: string } — บังคับกรอกเหตุผลตาม ADM-001 */
  @Patch(':auctionId/cancel')
  cancelAuction(@Param('auctionId') auctionId: string) {
    return this.adminAuctionsService.cancelAuction(auctionId);
  }
}
