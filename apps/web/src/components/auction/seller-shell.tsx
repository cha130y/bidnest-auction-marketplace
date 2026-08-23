"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"

/**
 * The gate every seller screen sits behind.
 *
 * All of them read or write through routes that need a token, and the token
 * lives in localStorage — so none of them can be server-rendered, and each
 * would otherwise repeat the same three states. `ready` keeps the page from
 * flashing "please sign in" at somebody who is signed in, in the moment before
 * localStorage has been read.
 *
 * Plain children rather than a render prop: nothing below needs the token
 * handed to it — `apiFetch` reads it from localStorage itself — and a
 * function cannot cross a Server-to-Client boundary anyway, which is how the
 * first version broke the build.
 */
export function SellerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, ready } = useAuthToken()

  if (!ready) {
    return (
      <div
        className="h-64 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!token) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-600">เข้าสู่ระบบเพื่อจัดการการประมูลของคุณ</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          // Reads `window.location` to build the callback, so it runs on click
          // rather than during render.
          onClick={() => router.push(loginHref())}
        >
          เข้าสู่ระบบ
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
