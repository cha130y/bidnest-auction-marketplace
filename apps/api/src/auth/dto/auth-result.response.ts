import { ApiProperty } from '@nestjs/swagger';
import { AuthUserResponse } from './auth-user.response';

/**
 * AUTH-002 step one. Deliberately carries no token and no hint about whether
 * the address exists — the same body comes back for any well-formed request.
 */
export class PendingTwoFactorResponse {
  @ApiProperty({ example: 'PENDING_2FA' })
  status: 'PENDING_2FA';

  @ApiProperty({
    example: 10,
    description: 'Minutes the emailed code stays valid'
  })
  expiresInMinutes: number;

  @ApiProperty({
    example: 60,
    description: 'Seconds before another code may be requested'
  })
  resendAfterSeconds: number;
}

/** AUTH-002 step two — the only place tokens are handed out. */
export class AuthTokensResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({
    description:
      'Opaque random string. Only its SHA-256 digest is stored server-side.'
  })
  refreshToken: string;

  @ApiProperty({ type: AuthUserResponse })
  user: AuthUserResponse;
}

/**
 * AUTH-006 — a first-time Line sign-in where Line released no address.
 *
 * AUTH-007 makes an emailed OTP mandatory on every login path and users.email
 * is NOT NULL, so the account cannot be opened until the client collects one.
 * Inventing a placeholder would satisfy the column and then quietly break the
 * OTP that guards the login.
 */
export class EmailRequiredResponse {
  @ApiProperty({ example: 'EMAIL_REQUIRED' })
  status: 'EMAIL_REQUIRED';

  @ApiProperty()
  message: string;
}
