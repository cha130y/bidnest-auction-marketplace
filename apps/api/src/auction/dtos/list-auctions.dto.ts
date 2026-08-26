import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';
import {
  AUCTION_SECTIONS,
  type AuctionSection
} from '../constants/auction-section.constant';

/**
 * AUC-008 — what a caller may ask of the auction list: which section, and
 * which page of it. The arrangement *within* a section is fixed by
 * AUCTION_SECTION_QUERIES and is deliberately not a parameter — "no special
 * flags or hidden scoring" means a caller cannot ask for a different ordering
 * of the hot list, and naming a section does not become a way to.
 */
export class ListAuctionsDto {
  /**
   * Omitted is the hot list, so a caller written before sections existed gets
   * exactly what it always did.
   *
   * A name that is not a section is a 400 rather than a quiet fall back to
   * hot: a screen asking for a section that does not exist has a bug, and
   * answering with a different list hides it.
   */
  @IsIn(AUCTION_SECTIONS)
  @IsOptional()
  section?: AuctionSection;

  /**
   * AUC-008 — narrowing, not reordering, which is what keeps the four filters
   * below compatible with "no special flags or hidden scoring".
   *
   * A section still decides which auctions are eligible and in what order; all
   * a filter can do is remove rows from what that section already returned.
   * There is deliberately no `sort` — asking for the hot list must not become
   * a way to get it arranged differently.
   *
   * The shapes mirror SearchProductDto, so the same filter panel on screen can
   * drive both lists and a URL means the same thing on either.
   */
  @IsString()
  @IsOptional()
  q?: string;

  // Accepts ?categoryIds=a&categoryIds=b and ?categoryIds=a,b
  @IsUUID('4', { each: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return value.split(',');
    return value;
  })
  categoryIds?: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

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
