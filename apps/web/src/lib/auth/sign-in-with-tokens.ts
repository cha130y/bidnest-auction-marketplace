import { signIn } from "next-auth/react"

import type { ApiTokens } from "@/lib/auth/api-contract"

/**
 * The last step of every way in — password, Google and Line all end here.
 *
 * By the time this runs apps/api has already issued the pair, so nothing about
 * the account is still in question: all that is left is handing it to NextAuth
 * and letting the `oauth-tokens` provider turn it into a session (see auth.ts).
 *
 * It exists as one function because all three callers used to inline the same
 * three lines and answer a failure with the same sentence, which made the two
 * things below easy to get wrong in one place and not the others.
 *
 * Browser-side: `signIn` from next-auth/react needs a window.
 */

/**
 * The one error worth trying again.
 *
 * `signIn()` fetches a fresh CSRF token immediately before it posts, and
 * `GET /api/auth/csrf` mints a new token *and rewrites the cookie* on every
 * call. So anything else that asks for one in between — a second tab sitting
 * on the login page, or the provider buttons on this very page — leaves the
 * attempt already in flight holding a token the cookie no longer matches, and
 * the answer is MissingCSRF.
 *
 * Nothing about the credentials is wrong in that case, and the next attempt
 * fetches both halves again, so it goes through. The other errors say
 * something real (CredentialsSignin means the token pair itself did not pass
 * `authorize()`) and would answer the same way twice — retrying those would
 * only double the wait before the person is told.
 */
const RETRYABLE = "MissingCSRF"

/**
 * Turns an issued token pair into a session.
 *
 * Returns null when the session is live, or the error code NextAuth answered
 * with — which the caller is expected to show. The code is not a message for a
 * person and it is not translated, deliberately: this fires where everything
 * that could sensibly fail already has, so whoever sees one is diagnosing
 * rather than reading, and the alternative was the sentence that sent us
 * through a browser's network tab to learn which of two unrelated causes it
 * had been.
 */
export async function signInWithTokens(
  tokens: ApiTokens
): Promise<string | null> {
  const payload = JSON.stringify(tokens)

  const first = await signIn("oauth-tokens", { payload, redirect: false })
  if (first?.error !== RETRYABLE) return first?.error ?? null

  const second = await signIn("oauth-tokens", { payload, redirect: false })
  return second?.error ?? null
}
