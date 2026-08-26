import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';

/**
 * ADM-002 — what an admin may narrow the user list by.
 *
 * The four parameters were read as bare query strings before this existed.
 * `@Query('status') status?: UserStatus` is a compile-time annotation, and the
 * global ValidationPipe skips a parameter whose metatype is a built-in like
 * `String` — so nothing checked any of them and all four reached Prisma as
 * typed. Same shape, same four failures, as ADM-005 had before #114.
 */
export class ListAdminUsersDto {
  /** The id of the last row already shown; that row is skipped, not repeated. */
  @IsUUID()
  @IsOptional()
  cursor?: string;

  /**
   * Bounded at 100, matching every other list in the API. Unbounded, one
   * hand-edited URL pulls the entire users table — and this is the list where
   * every row is a person's account and email address.
   */
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
