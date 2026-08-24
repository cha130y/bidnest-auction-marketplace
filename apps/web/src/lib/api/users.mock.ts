import type { Me } from "@/lib/api/types"

/**
 * TEMPORARY — stand-in for `GET /users/me` while `ProfileView` runs with
 * `USE_MOCK_DATA = true` (see `profile-view.tsx`). The real endpoint already
 * works; this exists only so the page has something to render before a real
 * access token is easy to get locally (USR-001 sits behind AUTH-002's
 * mandatory email OTP).
 *
 * Shaped and worded like `apps/api/prisma/seed-mock.ts`'s first seeded seller
 * (same id scheme, same English-word name/shop/address pools) so this reads
 * like a row that could really be in the dev database — with every optional
 * field filled in, which the seed leaves null, so the form has something to
 * show in every field at least once.
 */
export const MOCK_ME: Me = {
  id: "00000000-0000-4000-8000-100000000001",
  email: "mock-seller-1@bidnest.test",
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-06-01T08:00:00.000Z",
  profile: {
    firstName: "Kittipong",
    lastName: "Saetang",
    displayName: "Golden Trading",
    avatarUrl: "https://i.pravatar.cc/160?u=mock-seller-1",
    bio: "ขายของมือสองสภาพดีและของสะสมมา 3 ปี ตอบแชทไว จัดส่งทุกวัน",
    phone: "0891234567",
    location: "Bangkok",
    defaultShippingAddress: "123 Sukhumvit Rd, Bangkok 10110",
    updatedAt: "2026-08-20T14:30:00.000Z",
  },
}
