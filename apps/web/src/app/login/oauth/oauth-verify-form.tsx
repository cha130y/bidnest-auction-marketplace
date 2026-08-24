"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ApiTokens, PendingResponse } from "@/lib/auth/api-contract"
import {
  oauthEmailSchema,
  otpSchema,
  type OAuthEmailValues,
  type OtpValues
} from "@/lib/auth/schemas"

/**
 * AUTH-003 / AUTH-006 / AUTH-007 — finishing a provider sign-in.
 *
 * Two steps, and most users only ever see the second. The first exists for
 * AUTH-006's awkward case: Line hands back an account with no email address,
 * and there is nowhere to send the code that AUTH-007 makes mandatory, so the
 * screen asks for one and starts step one over.
 *
 * The provider token is not here and never was. Both submits go to route
 * handlers that read it from an httpOnly cookie, which is why this form posts
 * nothing but an address or six digits.
 */

const NOT_MY_FAULT = "เกิดข้อผิดพลาด กรุณาลองใหม่"

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  const parsed: unknown = await response.json().catch(() => ({}))
  return { ok: response.ok, body: parsed }
}

function messageFrom(body: unknown, fallback: string): string {
  const message = (body as { message?: unknown }).message
  return typeof message === "string" ? message : fallback
}

export function OAuthVerifyForm({
  provider,
  needsEmail,
  callbackUrl
}: {
  provider: "google" | "line"
  needsEmail: boolean
  callbackUrl: string
}) {
  const router = useRouter()
  const label = provider === "line" ? "LINE" : "Google"

  const [askEmail, setAskEmail] = useState(needsEmail)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const emailForm = useForm<OAuthEmailValues>({
    resolver: zodResolver(oauthEmailSchema),
    defaultValues: { email: "" }
  })

  const codeForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" }
  })

  /** AUTH-006 — the address, then step one again with it attached. */
  async function submitEmail(values: OAuthEmailValues) {
    setFailure(null)
    const result = await post("/api/auth/oauth/start", { email: values.email })

    if (!result.ok) {
      setFailure(messageFrom(result.body, NOT_MY_FAULT))
      return
    }

    const body = result.body as PendingResponse
    if (body.status === "EMAIL_REQUIRED") {
      setFailure(body.message)
      return
    }

    setSentTo(values.email)
    setNotice(`ส่งรหัสไปที่ ${values.email} แล้ว`)
    setAskEmail(false)
  }

  /** AUTH-007 — the code, and then the session. */
  async function submitCode(values: OtpValues) {
    setFailure(null)
    const result = await post("/api/auth/oauth/verify", { otp: values.otp })

    if (!result.ok) {
      setFailure(messageFrom(result.body, "รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว"))
      return
    }

    // The tokens are already issued; the provider gets no further say. All
    // that is left is turning them into a NextAuth session.
    const signedIn = await signIn("oauth-tokens", {
      payload: JSON.stringify(result.body as ApiTokens),
      redirect: false
    })

    if (signedIn?.error) {
      setFailure(NOT_MY_FAULT)
      return
    }
    router.push(callbackUrl)
    router.refresh()
  }

  /**
   * Step one again. The API's /auth/2fa/resend wants an email and a password,
   * and an account signed up through a provider has no password to offer, so
   * re-running the callback is the resend — with the same cooldown behind it.
   */
  async function resend() {
    setFailure(null)
    const result = await post("/api/auth/oauth/start", {})

    if (!result.ok) {
      setFailure(messageFrom(result.body, "ขอรหัสใหม่ไม่สำเร็จ"))
      return
    }
    setNotice("ส่งรหัสใหม่แล้ว")
  }

  if (askEmail) {
    const busy = emailForm.formState.isSubmitting
    return (
      <form
        onSubmit={emailForm.handleSubmit(submitEmail)}
        className="space-y-4"
        noValidate
      >
        <div>
          <h1 className="text-xl font-semibold">กรอกอีเมล</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            บัญชี {label} นี้ไม่ได้ให้อีเมลมา — ระบบต้องใช้อีเมลเพื่อส่งรหัสยืนยัน
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">อีเมล</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            {...emailForm.register("email")}
          />
          {emailForm.formState.errors.email && (
            <p className="text-sm text-destructive">
              {emailForm.formState.errors.email.message}
            </p>
          )}
        </div>

        {failure && <p className="text-sm text-destructive">{failure}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "กำลังส่ง..." : "ส่งรหัสยืนยัน"}
        </Button>

        <p className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline">
            ย้อนกลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </form>
    )
  }

  const busy = codeForm.formState.isSubmitting
  return (
    <form
      onSubmit={codeForm.handleSubmit(submitCode)}
      className="space-y-4"
      noValidate
    >
      <div>
        <h1 className="text-xl font-semibold">ยืนยันตัวตน</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sentTo
            ? `กรอกรหัส 6 หลักที่ส่งไปยัง ${sentTo}`
            : `เข้าสู่ระบบด้วย ${label} แล้ว — กรอกรหัส 6 หลักที่ส่งไปยังอีเมลของคุณ`}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="otp">รหัสยืนยัน</Label>
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          {...codeForm.register("otp")}
        />
        {codeForm.formState.errors.otp && (
          <p className="text-sm text-destructive">
            {codeForm.formState.errors.otp.message}
          </p>
        )}
      </div>

      {notice && !failure && (
        <p className="text-sm text-muted-foreground">{notice}</p>
      )}
      {failure && <p className="text-sm text-destructive">{failure}</p>}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "กำลังยืนยัน..." : "เข้าสู่ระบบ"}
      </Button>

      <div className="flex justify-between text-sm">
        <Link href="/login" className="text-muted-foreground underline">
          ย้อนกลับ
        </Link>
        <button
          type="button"
          className="text-muted-foreground underline"
          onClick={resend}
          disabled={busy}
        >
          ขอรหัสใหม่
        </button>
      </div>
    </form>
  )
}
