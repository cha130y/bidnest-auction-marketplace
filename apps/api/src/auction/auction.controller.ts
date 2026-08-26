import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Query,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReturnsOwnerFields } from '../common/decorators/owner-fields.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuctionService } from './auction.service';
import { CancelAuctionDto } from './dtos/cancel-auction.dto';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';
import { ListAuctionsDto } from './dtos/list-auctions.dto';
import { ListOwnAuctionsDto } from './dtos/list-own-auctions.dto';
import { UpdateAuctionDto } from './dtos/update-auction.dto';
import { AddAuctionImageDto } from './dtos/add-auction-image.dto';
import {
  AUCTION_IMAGE_MIME_PATTERN,
  MAX_AUCTION_IMAGE_BYTES
} from './constants/auction-image.constant';
import { StorageService } from '../storage/storage.service';

@Controller('auctions')
export class AuctionController {
  constructor(
    private readonly auctionService: AuctionService,
    private readonly storage: StorageService
  ) {}

  // SRS 2 — admins moderate the marketplace, they never sell in it
  @Roles('USER')
  @ReturnsOwnerFields()
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
  @ReturnsOwnerFields()
  @Get('drafts')
  listOwnDrafts(@CurrentUser('id') sellerId: string) {
    return this.auctionService.listOwnDrafts(sellerId);
  }

  /**
   * AUC-006 — the seller's own auctions, whatever state they are in.
   *
   * `mine` rather than a flag on `GET /auctions`: that route is the public
   * catalogue and is `@Public()`, so a personal view of it would mean one
   * handler answering two different questions with two different guards. It
   * also has to stay above `GET :id` — `:id` would otherwise swallow the
   * literal segment, exactly as it would `drafts`.
   *
   * Mirrors `GET /products/mine` on the catalogue side, so both halves of a
   * seller's shop are found the same way.
   */
  @Roles('USER')
  @ReturnsOwnerFields()
  @Get('mine')
  listOwnAuctions(
    @CurrentUser('id') sellerId: string,
    @Query() dto: ListOwnAuctionsDto
  ) {
    return this.auctionService.listOwnAuctions(sellerId, dto);
  }

  @Roles('USER')
  @ReturnsOwnerFields()
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
  @ReturnsOwnerFields()
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
  @ReturnsOwnerFields()
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
  @ReturnsOwnerFields()
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
  @ReturnsOwnerFields()
  @Post(':id/cancel')
  cancelOwnAuction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: CancelAuctionDto
  ) {
    return this.auctionService.cancelOwnAuction(id, sellerId, dto.reason);
  }

  /**
   * AUC-001 — adds a picture to a draft.
   *
   * The 503 is decided here, before multer reads anything: whether images can
   * be stored at all is known at startup, so a request that cannot succeed is
   * refused without a file crossing the wire. Cloudinary is optional in
   * `.env` precisely so the rest of the API boots without it.
   *
   * The file is validated for type and size twice over — once by multer's own
   * limit, once by the pipe — because the limit truncates and the pipe
   * explains.
   */
  @Roles('USER')
  @ReturnsOwnerFields()
  @Post(':id/images')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_AUCTION_IMAGE_BYTES } })
  )
  addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: AddAuctionImageDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: AUCTION_IMAGE_MIME_PATTERN })
        .addMaxSizeValidator({ maxSize: MAX_AUCTION_IMAGE_BYTES })
        .build({ fileIsRequired: true })
    )
    image: Express.Multer.File
  ) {
    // Before the ownership check on purpose, and the order is worth stating:
    // 503 is a fact about this server, 404 is a fact about the request, and a
    // server that cannot store an image cannot serve any of these calls. It
    // also happens to leak less — every caller gets the same answer whatever
    // id they ask about, so the refusal reveals nothing about whose draft it
    // is. Once configured, the specific 404 comes back.
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Image upload is not configured on this server'
      );
    }

    return this.auctionService.addDraftImage(id, sellerId, image, dto.altText);
  }

  /** AUC-001 — removes a picture from a draft. */
  @Roles('USER')
  @ReturnsOwnerFields()
  @Delete(':id/images/:imageId')
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.auctionService.removeDraftImage(id, sellerId, imageId);
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
  @ReturnsOwnerFields()
  @Get(':id')
  findPublicAuction(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request
  ) {
    return this.auctionService.findPublicAuction(id, request.user?.id);
  }
}
