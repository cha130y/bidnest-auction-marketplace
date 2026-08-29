import { PartialType } from '@nestjs/mapped-types';
import { CreateAuctionDraftDto } from './create-auction-draft.dto';

/**
 * AUC-006 — every field of a draft is editable while the auction has not
 * started, so the shape is the create DTO with everything optional. What may be
 * edited *when* is a status question, decided in the service, not a shape one.
 *
 * Sending `imageUrls` replaces the whole set rather than appending to it: the
 * seller edits a gallery as a list, and a partial merge would leave no way to
 * remove a picture.
 */
export class UpdateAuctionDto extends PartialType(CreateAuctionDraftDto) {}
