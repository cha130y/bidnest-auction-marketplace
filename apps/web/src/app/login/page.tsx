import { Suspense } from "react"

import { LoginForm } from "@/app/login/login-form"

export const metadata = { title: "เข้าสู่ระบบ · BidNest" }

/**
 * AUTH-002 — the form reads `callbackUrl` with `useSearchParams()`, which Next
 * requires a Suspense boundary around so the rest of the page can still be
 * prerendered.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
