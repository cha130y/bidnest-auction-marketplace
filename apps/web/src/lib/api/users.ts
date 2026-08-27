import { apiFetch } from "@/lib/api/client"

/**
 * USR-001 — the signed-in user's own profile.
 *
 * Everything here is private to its owner. What the rest of the site shows
 * publicly is `displayName` and nothing else, which is why auction and product
 * responses carry that one field rather than a user object.
 */

export type MyProfile = {
  id: string
  email: string
  role: "USER" | "ADMIN"
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
  createdAt: string
  profile: {
    firstName: string
    lastName: string | null
    displayName: string
    avatarUrl: string | null
    bio: string | null
    /**
     * The default shipping address, in the same six fields `ShippingAddress`
     * uses. Checkout prefills its form straight from these — see
     * `profileAddressDefaults` in `checkout-view.tsx`.
     */
    phone: string | null
    recipientName: string | null
    line1: string | null
    line2: string | null
    city: string | null
    postalCode: string | null
    updatedAt: string
  }
}

/**
 * A partial update. An omitted key keeps its value; an explicit `null` clears
 * an optional field. `firstName` and `displayName` are the two that cannot be
 * cleared — public pages fall back to the display name, so a profile without
 * one has nothing to show.
 */
export type UpdateMyProfile = {
  firstName?: string
  lastName?: string | null
  displayName?: string
  avatarUrl?: string | null
  bio?: string | null
  phone?: string | null
  recipientName?: string | null
  line1?: string | null
  line2?: string | null
  city?: string | null
  postalCode?: string | null
}

/**
 * Kept here, next to the fetch, rather than in the screen that reads it.
 *
 * It used to live in `profile-form.tsx`, which was fine while that form was
 * the only caller. Checkout now reads the same profile to prefill its address,
 * and importing the key from there would have pulled the whole profile screen
 * — react-hook-form, the zod resolver and all — into the checkout module for
 * the sake of two strings.
 */
export const myProfileQueryKey = ["users", "me"] as const

export function getMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>("/users/me")
}

export function updateMyProfile(body: UpdateMyProfile): Promise<MyProfile> {
  return apiFetch<MyProfile>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(body)
  })
}
