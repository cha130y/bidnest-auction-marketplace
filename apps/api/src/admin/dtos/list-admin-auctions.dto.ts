import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuctionStatus } from '../../../generated/prisma/enums';

/**
 * ADM-001 — what an admin may narrow the oversight list by.
 *
 * Status is the only filter, and it is the one moderation actually needs:
 * "show me what is running right now" is the question somebody asks before
 * cancelling something. There is no free-text search — that is a catalogue
 * feature, not an oversight one, and inventing one here would be a second
 * search implementation to keep in step with AUC-008.
 */
export class ListAdminAuctionsDto {
  @IsEnum(AuctionStatus)
  @IsOptional()
  status?: AuctionStatus;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
