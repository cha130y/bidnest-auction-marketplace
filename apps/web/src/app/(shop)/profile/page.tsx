import type { Metadata } from "next"

import { ProfileForm } from "@/components/user/profile-form"

export const metadata: Metadata = {
  title: "โปรไฟล์ของฉัน · BidNest",
  description: "ข้อมูลส่วนตัว ที่อยู่จัดส่ง และชื่อที่แสดงต่อผู้ใช้อื่น"
}

/** USR-001 — the signed-in user's own profile. */
export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-6">
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          โปรไฟล์ของฉัน
        </h1>
        <p className="mt-2 text-base text-n-600">
          ข้อมูลทั้งหมดในหน้านี้เป็นของคุณคนเดียว — มีเพียงชื่อที่แสดงเท่านั้นที่ผู้ใช้อื่นมองเห็น
        </p>
      </header>

      <ProfileForm />
    </div>
  )
}
