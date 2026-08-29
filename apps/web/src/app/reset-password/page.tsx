import { Suspense } from "react"

import { ResetPasswordForm } from "@/app/reset-password/reset-form"

export const metadata = { title: "ตั้งรหัสผ่านใหม่ · BidNest" }

/** AUTH-005 — the token arrives in the query string, hence the boundary. */
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
