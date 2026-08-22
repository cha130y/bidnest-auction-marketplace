import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * WAT-002 — paging only. The order is "most recently watched first", which is
 * the only arrangement a watchlist has any use for, so it is not something a
 * caller may change.
 */
export class ListWatchlistDto {
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
