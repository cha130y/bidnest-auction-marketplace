import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';

/**
 * The only user shape auth endpoints are allowed to return. passwordHash and
 * every other credential column stay server-side (SRS section 6).
 */
export class AuthUserResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'somchai@example.com' })
  email: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role: UserRole;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty({ example: 'สมชาย' })
  firstName: string;

  @ApiPropertyOptional({ example: 'ใจดี', nullable: true })
  lastName: string | null;

  @ApiProperty({ example: 'somchai' })
  displayName: string;

  /**
   * USR-001 — the header draws this the moment someone signs in, so it travels
   * with the sign-in rather than being fetched separately. Null for an account
   * that has not chosen one; the caller falls back to an initial.
   */
  @ApiPropertyOptional({ format: 'url', nullable: true })
  avatarUrl: string | null;

  @ApiProperty()
  createdAt: Date;
}
