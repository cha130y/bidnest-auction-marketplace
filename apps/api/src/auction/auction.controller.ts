import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Patch,
  Post,
  Req
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuctionService } from './auction.service';
import { CancelAuctionDto } from './dtos/cancel-auction.dto';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';
import { ListAuctionsDto } from './dtos/list-auctions.dto';
import { UpdateAuctionDto } from './dtos/update-auction.dto';

@Controller('auctions')
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  // SRS 2 — admins moderate the marketplace, they never sell in it
  @Roles('USER')
  @Post('drafts')
  createDraft(
    @CurrentUser('id') sellerId: string,
    @Body() dto: CreateAuctionDraftDto
  ) {
    return this.auctionService.createDraft(sellerId, dto);
  }

  // Keep every `drafts` route above a future `GET :id`, or Nest matches the
  // literal path against the parameter route first.
  @Roles('USER')
  @Get('drafts')
  listOwnDrafts(@CurrentUser('id') sellerId: string) {
    return this.auctionService.listOwnDrafts(sellerId);
  }

  @Roles('USER')
  @Get('drafts/:id')
  findOwnDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.auctionService.findOwnDraft(id, sellerId);
  }

  // AUC-002 — a read-only checklist: it reports what still blocks publishing
  // and changes nothing, which is why it is a GET.
  @Roles('USER')
  @Get('drafts/:id/validation')
  validateOwnDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.auctionService.validateOwnDraft(id, sellerId);
  }

  // AUC-004 — preview is a read, so the draft keeps its status.
  @Roles('USER')
  @Get('drafts/:id/preview')
  previewOwnDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.auctionService.previewOwnDraft(id, sellerId);
  }

  // AUC-004 — publish is the state change, hence POST. 200 rather than the
  // POST default of 201: it moves an auction that already exists.
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Post('drafts/:id/publish')
  publishDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.auctionService.publishDraft(id, sellerId);
  }

  // AUC-006 — editing covers DRAFT and SCHEDULED alike, so this sits on the
  // auction path rather than under `drafts`, which only ever matches a DRAFT.
  @Roles('USER')
  @Patch(':id')
  updateOwnAuction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: UpdateAuctionDto
  ) {
    return this.auctionService.updateOwnAuction(id, sellerId, dto);
  }

  // AUC-006 — a cancellation is a lifecycle move, not a deletion: the auction
  // stays readable as CANCELLED, which is why this is not a DELETE.
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancelOwnAuction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: CancelAuctionDto
  ) {
    return this.auctionService.cancelOwnAuction(id, sellerId, dto.reason);
  }

  /**
   * AUC-008 — the auction list. Public, and a caller may ask for two things:
   * which section and which page. No section is the Hot Auctions list, so a
   * client written before sections existed is unaffected.
   *
   * The ranking *within* a section is fixed by the requirement, so there is
   * still no `sort` parameter to reach for — see AUCTION_SECTION_QUERIES.
   */
  @Public()
  @Get()
  listAuctions(@Query() dto: ListAuctionsDto) {
    return this.auctionService.listAuctions(dto);
  }

  /**
   * AUC-005 — the first buyer-facing route, and the reason every `drafts` path
   * above has to stay above it: `:id` would otherwise swallow the literal
   * segment `drafts`.
   *
   * Public, so a signed-out visitor can browse. AccessTokenGuard still fills in
   * `request.user` when a token happens to be sent, which is what lets the
   * seller's own view come back through the owner mapper. `@CurrentUser()`
   * cannot be used here — it throws when nobody is signed in.
   */
  @Public()
  @Get(':id')
  findPublicAuction(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request
  ) {
    return this.auctionService.findPublicAuction(id, request.user?.id);
  }
}
