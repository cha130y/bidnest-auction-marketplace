import type { AuthProvider } from '../../../generated/prisma/enums';

/**
 * What a provider tells us about the person signing in, after their token has
 * been verified against that provider.
 *
 * `email` is optional on purpose. AUTH-006 states that Line may not release
 * one, so identity hangs on the provider plus the account id, never on the
 * address.
 */
export type OAuthProfile = {
  provider: AuthProvider;
  providerAccountId: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
};

/** Verifies a provider token and reports who it belongs to. */
export interface OAuthTokenVerifier {
  readonly provider: AuthProvider;
  verify(idToken: string): Promise<OAuthProfile>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');
export const LINE_VERIFIER = Symbol('LINE_VERIFIER');
