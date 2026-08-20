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
