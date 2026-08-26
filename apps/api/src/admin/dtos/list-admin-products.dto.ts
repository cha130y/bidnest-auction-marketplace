import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/enums';

/**
 * ADM-005 — what an admin may narrow the product oversight list by.
 *
 * The three parameters were read straight off the query string before this
 * existed, typed but never validated: `@Query('status') status?: ProductStatus`
 * is a compile-time annotation, and the global `ValidationPipe` skips a
 * parameter whose metatype is a built-in like `String`. Nothing checked them,
 * so all three reached Prisma as typed, and three of the four ways to get one
 * wrong answered 500:
 *
 * - `?status=BOGUS` — not a member of the enum, so the `where` clause was
 *   rejected by the query engine rather than by us.
 * - `?cursor=notauuid` — compared against a `uuid` column.
 * - `?limit=abc` — `Number('abc')` is `NaN`, and `NaN ?? 20` is `NaN`, so the
 *   nullish default never caught it and `take: NaN` went through.
 *
 * The fourth answered 200 and was the worse one: `?limit=99999` returned every
 * product in the table, since nothing bounded it.
 *
 * Cursor rather than page, unlike ADM-001's list: this endpoint was scaffolded
 * next to ADM-002 and ADM-004, which page that way, and the admin table on the
 * web already sends `cursor`.
 */
export class ListAdminProductsDto {
  /** The id of the last row already shown; that row is skipped, not repeated. */
  @IsUUID()
  @IsOptional()
  cursor?: string;

  /**
   * Bounded at 100, matching every other list in the API. Unbounded, one
   * hand-edited URL pulls the whole products table through a `select` that
   * joins each seller's profile — and an admin page is exactly where somebody
   * edits a URL to see "all of them".
   */
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;
}
