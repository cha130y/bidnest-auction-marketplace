import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AdminActionType } from '../../../generated/prisma/enums';

/**
 * ADM-004 — what an admin may narrow the audit log by.
 *
 * Read as bare query strings before this existed, with the same consequence
 * as ADM-002 and ADM-005: the global ValidationPipe does not run against a
 * `String` metatype, so `?actionType=BOGUS`, `?cursor=notauuid` and
 * `?limit=abc` each reached Prisma unchecked and came back 500.
 */
export class ListAdminActionsDto {
  /** The id of the last row already shown; that row is skipped, not repeated. */
  @IsUUID()
  @IsOptional()
  cursor?: string;

  /**
   * Bounded at 100, matching every other list in the API. The audit log is
   * append-only and only grows, so it is the one list where an unbounded
   * `limit` gets worse every day the project runs.
   */
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsEnum(AdminActionType)
  @IsOptional()
  actionType?: AdminActionType;
}
