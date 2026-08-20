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
import { Trim } from '../../common/decorators/trim.decorator';

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

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  scheduledStartAt?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  scheduledEndAt?: Date;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];
}
