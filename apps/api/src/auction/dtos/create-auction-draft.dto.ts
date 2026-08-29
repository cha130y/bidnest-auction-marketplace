import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength
} from 'class-validator';
import { ProductCondition } from '../../../generated/prisma/enums';
import { IsNotInThePast } from '../../common/decorators/is-not-in-the-past.decorator';
import { Trim } from '../../common/decorators/trim.decorator';
import { SCHEDULE_PAST_GRACE_MS } from '../constants/auction-schedule.constant';

/**
 * AUC-001 — the seller's private scratchpad. Only what the DRAFT row cannot be
 * written without is required here; the schedule, the images and the reserve
 * rule are the publish gate's job (AUC-002), so a half-finished draft is still
 * savable.
 */
export class CreateAuctionDraftDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsUUID()
  categoryId: string;

  @IsEnum(ProductCondition)
  condition: ProductCondition;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  startingPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  minBidIncrement: number;

  // AUC-003 — private to the seller, never returned to buyers
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  reservePrice?: number;

  /**
   * Both ends of the schedule are refused if they point into the past, because
   * a time already gone by is never what a seller meant to write. Optional
   * stays optional — this rejects a nonsense value, it does not demand one.
   *
   * The start is guarded *here* and deliberately not in the publish gate: by
   * the time a draft is published its start may well have passed, and that is
   * exactly how an auction that runs immediately begins (AUC-004). The same
   * instant is a slip while it is being typed and legitimate a minute later,
   * so the rule belongs where the writing happens.
   *
   * `UpdateAuctionDto` is `PartialType` of this class, so an edit is held to
   * the same rule without a second copy of it to drift.
   */
  @IsNotInThePast(SCHEDULE_PAST_GRACE_MS)
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  scheduledStartAt?: Date;

  @IsNotInThePast(SCHEDULE_PAST_GRACE_MS)
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  scheduledEndAt?: Date;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];
}
