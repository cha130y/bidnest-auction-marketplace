import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvVariable } from '../../config/env.validation';
import { AuthProvider } from '../../../generated/prisma/enums';
import type { OAuthProfile, OAuthTokenVerifier } from './oauth-profile';

/** The subset of Google's tokeninfo response this needs. */
type GoogleTokenInfo = {
  sub?: string;
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  error_description?: string;
};

/**
 * AUTH-003 — proves a Google ID token is genuine by asking Google.
 *
 * The client never gets to say who it is. NextAuth performs the redirect and
 * hands the resulting ID token to us; anything self-reported alongside it is
 * ignored, because a caller who could name their own `sub` could sign in as
 * anybody.
 *
 * `aud` is checked against our own client id: a token minted for a different
 * application is a valid Google token and still must not be accepted here.
 */
@Injectable()
export class GoogleTokenVerifier implements OAuthTokenVerifier {
  readonly provider = AuthProvider.GOOGLE;

  constructor(private readonly config: ConfigService<EnvVariable, true>) {}

  async verify(idToken: string): Promise<OAuthProfile> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!clientId) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server'
      );
    }

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    ).catch(() => {
      throw new ServiceUnavailableException('Could not reach Google');
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const info = (await response.json()) as GoogleTokenInfo;

    if (!info.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (info.aud !== clientId) {
      throw new UnauthorizedException(
        'Google token was issued for another app'
      );
    }

    // Google sends this back as the string "true", not a boolean.
    const emailVerified =
      info.email_verified === true || info.email_verified === 'true';

    return {
      provider: AuthProvider.GOOGLE,
      providerAccountId: info.sub,
      email: info.email?.toLowerCase(),
      emailVerified: Boolean(info.email) && emailVerified,
      displayName: info.name
    };
  }
}
