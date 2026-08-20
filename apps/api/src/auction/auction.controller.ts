import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuctionService } from './auction.service';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';

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
}
