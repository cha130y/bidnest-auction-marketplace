import { apiFetch } from "@/lib/api/client"

/**
 * The auth calls the login screens make directly, outside NextAuth.
 *
 * Signing in itself goes through `signIn('credentials', …)` so NextAuth owns
 * the session (SRS section 3). Everything here is the work that happens either
 * side of that: mailing a code before, and account recovery after.
 */

export type PendingTwoFactor = {
  status: "PENDING_2FA"
  expiresInMinutes: number
  resendAfterSeconds: number
}

export type EmailRequired = {
  status: "EMAIL_REQUIRED"
  message: string
}

export type RegisteredUser = {
  id: string
  email: string
  displayName: string
}

/** AUTH-002 step one — checks the password and mails the code. No token yet. */
export function requestLoginCode(input: {
  email: string
  password: string
}): Promise<PendingTwoFactor> {
  return apiFetch<PendingTwoFactor>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

/** AUTH-007 — a fresh code, refused by the API while the cooldown runs. */
export function resendLoginCode(input: {
  email: string
  password: string
}): Promise<PendingTwoFactor> {
  return apiFetch<PendingTwoFactor>("/auth/2fa/resend", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

/** AUTH-001 — registration does not sign anyone in; login still follows. */
export function register(input: {
  email: string
  password: string
  firstName: string
  lastName?: string
  displayName: string
}): Promise<RegisteredUser> {
  return apiFetch<RegisteredUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

/**
 * AUTH-005 — always resolves, whatever the address. The API answers the same
 * way for a stranger as for a member so the form cannot be used to find out
 * who has an account, and the screen must not undo that by reacting.
 */
export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  })
}

/** AUTH-005 — spends the emailed link and revokes every existing session. */
export function resetPassword(input: {
  token: string
  password: string
}): Promise<void> {
  return apiFetch<void>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input)
  })
}
