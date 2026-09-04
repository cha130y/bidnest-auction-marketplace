import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * CART-004 — what a winner may narrow their own list of won lots by.
 *
 * `unpaid` is the only filter, and it exists because the one screen asking for
 * this list is a reminder to pay: a paid lot has an order to follow in
 * `/orders` and nothing left to do here. Everything else a filter could offer
 * — status, category, a date range — would be narrowing a list that is a
 * handful of rows long for even the busiest bidder.
 *
 * Absent means "every lot I won", paid or not, so the endpoint is still the
 * honest answer to its own name rather than a reminder wearing a list's
 * clothes.
 */
export class ListWonAuctionsDto {
  /**
   * Written out rather than `Boolean(value)`: that cast turns the string
   * "false" into true, which would make `?unpaid=false` mean its opposite.
   * Anything that is neither word falls through unchanged and is refused by
   * `@IsBoolean()`, so a typo is a 400 and not a silent unfiltered list.
   */
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  unpaid?: boolean;

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
