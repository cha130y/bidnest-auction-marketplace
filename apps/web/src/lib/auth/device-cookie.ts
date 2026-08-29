import { cookies } from "next/headers"

/**
 * AUTH-007 — the token that says this browser has answered a code before.
 *
 * It lives in an httpOnly cookie on this origin, which is the only reason the
 * two login routes exist at all. The page cannot hold it: a value the login
 * form could read is a value any script on the page could read, and this one
 * is what lets a sign-in skip the second factor. The API cannot set it either,
 * since it answers from a different origin and a cross-site cookie needs
 * `SameSite=None; Secure`, which cannot work over plain http in development.
 *
 * Server-only: `cookies()` is from next/headers.
 */

const DEVICE_COOKIE = "bidnest_device"

/** Matches TRUSTED_DEVICE_TTL_DAYS on the API. */
const MAX_AGE = 30 * 24 * 60 * 60

/** The API mints 32 random bytes as hex; anything else was not ours. */
const SHAPE = /^[0-9a-f]{64}$/

export async function readDeviceToken(): Promise<string | undefined> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value
  return value && SHAPE.test(value) ? value : undefined
}

export async function writeDeviceToken(token: string): Promise<void> {
  ;(await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE
  })
}

/**
 * Forget this browser locally.
 *
 * Only half the job on its own — the row on the API stays until it expires or
 * a password reset revokes it — but it is the half that stops this browser
 * from presenting the token again.
 */
export async function clearDeviceToken(): Promise<void> {
  ;(await cookies()).delete(DEVICE_COOKIE)
}
