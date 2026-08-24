/**
 * The shapes apps/api hands back on the auth routes.
 *
 * Kept next to the NextAuth config rather than in lib/api so the session
 * callbacks can lean on them without dragging in the browser-side client,
 * which reads a token that does not exist yet at that point.
 */

export type ApiUser = {
  id: string
  email: string
  role: "USER" | "ADMIN"
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
  firstName: string
  lastName: string | null
  displayName: string
  createdAt: string
}

export type ApiTokens = {
  accessToken: string
  refreshToken: string
  user: ApiUser
}

/** AUTH-002 step one, and the AUTH-006 case where Line released no address. */
export type PendingResponse =
  | { status: "PENDING_2FA"; expiresInMinutes: number; resendAfterSeconds: number }
  | { status: "EMAIL_REQUIRED"; message: string }

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

/** Message the API sent, if it sent one worth showing. */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body) {
    const message = (body as { message: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0]
    }
  }
  return fallback
}
