import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuctionStatus } from '../../../generated/prisma/enums';

/**
 * AUC-006 — what a seller may narrow their own list by.
 *
 * Every status is allowed, unlike the public list (AUC-008): DRAFT and
 * CANCELLED are hidden from buyers, and this is the one screen where they are
 * the point — a draft to finish, or a record of what was called off.
 *
 * Status is the only filter. A seller looking for one of their own auctions
 * scrolls; free-text search over a handful of rows would be a second search to
 * keep in step with the catalogue's for no gain.
 */
export class ListOwnAuctionsDto {
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
