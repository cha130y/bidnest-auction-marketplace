import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
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
