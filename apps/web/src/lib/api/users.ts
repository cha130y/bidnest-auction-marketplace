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
    phone: string | null
    location: string | null
    defaultShippingAddress: string | null
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
  location?: string | null
  defaultShippingAddress?: string | null
}

export function getMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>("/users/me")
}

export function updateMyProfile(body: UpdateMyProfile): Promise<MyProfile> {
  return apiFetch<MyProfile>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(body)
  })
}
