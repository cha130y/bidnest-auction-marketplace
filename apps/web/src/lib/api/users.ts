import { apiFetch } from "@/lib/api/client"
import type { Me } from "@/lib/api/types"

/** Mirrors UpdateProfileDto in apps/api/src/users/dtos/update-profile.dto.ts. */
export type UpdateProfileInput = {
  firstName?: string
  lastName?: string | null
  displayName?: string
  avatarUrl?: string | null
  bio?: string | null
  phone?: string | null
  location?: string | null
  defaultShippingAddress?: string | null
}

/** USR-001 — the signed-in user's own profile. Needs a token. */
export function getMe() {
  return apiFetch<Me>("/users/me")
}

/**
 * USR-001 — partial update: an omitted key keeps its value, while an
 * explicit `null` clears an optional one (the API does the trimming).
 */
export function updateMe(input: UpdateProfileInput) {
  return apiFetch<Me>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}
