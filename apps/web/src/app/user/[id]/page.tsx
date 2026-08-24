import type { Metadata } from "next"

import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { ProfileView } from "@/components/user/profile-view"

export const metadata: Metadata = {
  title: "โปรไฟล์ของฉัน · BidNest",
  description: "จัดการชื่อ รูปโปรไฟล์ ข้อมูลติดต่อ และที่อยู่จัดส่งเริ่มต้น",
}

/**
 * USR-001 — the signed-in user's own profile.
 *
 * `GET/PATCH /users/me` never take an id — the backend resolves "me" from the
 * access token alone — so `id` here only shapes the URL. `ProfileView` fetches
 * via the token and, if it does not match this `id`, corrects the address bar
 * to the caller's own rather than ever rendering someone else's data.
 */
export default async function UserProfilePage({
  params,
}: PageProps<"/user/[id]">) {
  const { id } = await params

  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
          <header className="py-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              โปรไฟล์ของฉัน
            </h1>
            <p className="mt-2 text-base text-n-600">
              แก้ไขชื่อที่แสดง รูปโปรไฟล์ ข้อมูลติดต่อ
              และที่อยู่จัดส่งเริ่มต้นสำหรับ checkout
            </p>
          </header>

          <ProfileView id={id} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
