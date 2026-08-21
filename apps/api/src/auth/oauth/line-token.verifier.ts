import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvVariable } from '../../config/env.validation';
import { AuthProvider } from '../../../generated/prisma/enums';
import type { OAuthProfile, OAuthTokenVerifier } from './oauth-profile';

/** The subset of Line's verify response this needs. */
type LineTokenInfo = {
  sub?: string;
  aud?: string;
  email?: string;
  name?: string;
  error_description?: string;
};

/**
 * AUTH-006 — proves a Line ID token is genuine by asking Line.
 *
 * Line releases an email only to channels that applied for the permission and
 * were approved, so `email` is frequently absent. AUTH-006 accounts for that:
 * identity hangs on the provider plus the account id, never on the address.
 *
 * When Line does send an address it comes from an account Line already
 * verified, so it is treated as verified here.
 */
@Injectable()
export class LineTokenVerifier implements OAuthTokenVerifier {
  readonly provider = AuthProvider.LINE;

  constructor(private readonly config: ConfigService<EnvVariable, true>) {}

  async verify(idToken: string): Promise<OAuthProfile> {
    const channelId = this.config.get('LINE_CHANNEL_ID', { infer: true });
    if (!channelId) {
      throw new ServiceUnavailableException(
        'Line sign-in is not configured on this server'
      );
    }

    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId })
    }).catch(() => {
      throw new ServiceUnavailableException('Could not reach Line');
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Line token');
    }

    const info = (await response.json()) as LineTokenInfo;

    if (!info.sub) {
      throw new UnauthorizedException('Invalid Line token');
    }
    // Line checks the audience for us when client_id is posted, but a mismatch
    // in the payload would still mean the token is not ours.
    if (info.aud !== channelId) {
      throw new UnauthorizedException('Line token was issued for another app');
    }

    return {
      provider: AuthProvider.LINE,
      providerAccountId: info.sub,
      email: info.email?.toLowerCase(),
      emailVerified: Boolean(info.email),
      displayName: info.name
    };
  }
}
