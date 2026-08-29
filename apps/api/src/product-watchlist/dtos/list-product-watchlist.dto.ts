import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Paging only, and the same shape as `ListWatchlistDto` on the auction side so
 * a screen showing both lists pages them the same way.
 *
 * The order is "most recently followed first", which is the only arrangement a
 * follow list has any use for, so it is not something a caller may change.
 */
export class ListProductWatchlistDto {
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
