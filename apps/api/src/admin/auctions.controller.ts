import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminAuctionsService } from './auctions.service';
import { AdminCancelAuctionDto } from './dtos/cancel-auction.dto';
import { ListAdminAuctionsDto } from './dtos/list-admin-auctions.dto';

/**
 * ADM-001 — Auction oversight (owner: Dev 4)
 *
 * ต่างจาก AUC-006 ที่ผู้ขายยกเลิกได้เฉพาะสถานะ DRAFT/SCHEDULED —
 * admin ยกเลิกประมูลที่ ACTIVE ได้ด้วย (การยกเลิกฉุกเฉิน)
 *
 * `@Roles('ADMIN')` ทำงานผ่าน RolesGuard ที่ลงทะเบียนเป็น APP_GUARD ใน
 * AppModule ตัวตนผู้เรียกมาจาก AccessTokenGuard (AUTH-008) — controller นี้
 * อ่าน identity ผ่าน `@CurrentUser()` อย่างเดียว เหมือน ADM-005 ของ Dev 3
 */
@Roles('ADMIN')
@Controller('admin/auctions')
export class AdminAuctionsController {
  constructor(private readonly adminAuctionsService: AdminAuctionsService) {}

  /** query: page?, limit?, status? (AuctionStatus) — drafts included */
  @Get()
  listAuctions(@Query() dto: ListAdminAuctionsDto) {
    return this.adminAuctionsService.listAuctions(dto);
  }

  /**
   * body: { reason: string } — บังคับกรอกเหตุผลตาม ADM-001
   *
   * PATCH rather than DELETE: the auction is not removed. It stays readable as
   * CANCELLED, carrying the reason, which is what makes the moderation
   * auditable afterwards.
   */
  @Patch(':auctionId/cancel')
  cancelAuction(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminCancelAuctionDto
  ) {
    return this.adminAuctionsService.cancelAuction(
      auctionId,
      adminId,
      dto.reason
    );
  }
}
