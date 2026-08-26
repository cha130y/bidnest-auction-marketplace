import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';

/**
 * ADM-002 — what an admin may narrow the user list by.
 *
 * Mirrors ADM-001's ListAdminAuctionsDto: a bad `status`/`role` used to reach
 * Prisma's `where` clause as a raw string and come back as an unhandled 500
 * instead of a 400, and an out-of-range `limit` or non-UUID `cursor` failed
 * the same way. Validating here means the global ValidationPipe rejects all
 * four before the query ever runs.
 */
export class ListAdminUsersDto {
  @IsUUID()
  @IsOptional()
  cursor?: string;

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
