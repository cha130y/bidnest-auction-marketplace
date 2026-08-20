import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * AUC-008 — paging only. The ordering is fixed by the acceptance criteria and
 * is deliberately not a parameter: "no special flags or hidden scoring" means
 * a caller cannot ask for a different arrangement of the hot list.
 */
export class ListHotAuctionsDto {
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
