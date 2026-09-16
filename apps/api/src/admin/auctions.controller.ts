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
 * Unlike AUC-006, where a seller can only cancel while DRAFT/SCHEDULED, an
 * admin can also cancel an ACTIVE auction (an emergency cancellation).
 *
 * `@Roles('ADMIN')` works through the RolesGuard registered as APP_GUARD in
 * AppModule. The caller's identity comes from AccessTokenGuard (AUTH-008) —
 * this controller reads identity only through `@CurrentUser()`, the same as
 * Dev 3's ADM-005.
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
   * body: { reason: string } — a reason is mandatory per ADM-001
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
