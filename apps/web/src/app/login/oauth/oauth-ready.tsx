"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"

import type { ApiTokens } from "@/lib/auth/api-contract"

/**
 * AUTH-007 — the last step of a Line sign-in from a browser already trusted.
 *
 * There is nothing to ask. apps/api recognised the device and issued the pair
 * at the callback; all that is left is claiming it and turning it into a
 * session. The screen exists only because Line's leg is a redirect and a
 * redirect cannot hand a token pair to a page.
 */
export function OAuthReady({ label }: { label: string }) {
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)
  // React runs effects twice in development, and the claim is one shot: the
  // second call would find the cookie already spent and report a failure over
  // a sign-in that had just succeeded.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      const response = await fetch("/api/auth/oauth/claim", { method: "POST" })
      const body: unknown = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = (body as { message?: string }).message
        setFailure(message ?? "เข้าสู่ระบบไม่สำเร็จ")
        return
      }

      const { tokens, callbackUrl } = body as {
        tokens: ApiTokens
        callbackUrl?: string
      }

      const signedIn = await signIn("oauth-tokens", {
        payload: JSON.stringify(tokens),
        redirect: false
      })

      if (signedIn?.error) {
        setFailure("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่")
        return
      }

      router.replace(callbackUrl ?? "/")
      router.refresh()
    })()
  }, [router])

  if (failure) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">เข้าสู่ระบบไม่สำเร็จ</h1>
        <p className="text-sm text-destructive">{failure}</p>
        <p className="text-sm">
          <Link href="/login" className="text-muted-foreground underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">กำลังเข้าสู่ระบบ...</h1>
      <p className="text-sm text-muted-foreground">
        อุปกรณ์นี้เคยยืนยันตัวตนไว้แล้ว จึงไม่ต้องกรอกรหัสจากอีเมลอีก —
        เข้าสู่ระบบด้วย {label} เรียบร้อย
      </p>
    </div>
  )
}
