"use client"

import { useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resendLoginCode } from "@/lib/api/auth/auth-api"
import { ApiError } from "@/lib/api/client"
import type { ApiTokens, PendingResponse } from "@/lib/auth/api-contract"
import {
  loginSchema,
  otpSchema,
  type LoginValues,
  type OtpValues
} from "@/lib/auth/schemas"

/**
 * AUTH-002 / AUTH-007 — signing in.
 *
 * Two steps the first time from a browser: the password, then the code that
 * was mailed. After that the code step is skipped, because step one comes back
 * with the tokens already issued — the API recognised the device from a cookie
 * this page never sees.
 *
 * Both steps go through route handlers under /api/auth/password rather than
 * calling the API directly, which is what makes that cookie possible: it is
 * httpOnly, so only the server can attach it going out or store it coming
 * back. NextAuth still owns the session at the end, through the same
 * `oauth-tokens` provider the Google and Line screens use — the tokens are
 * already issued by then, and turning them into a session is all that is left.
 *
 * Two forms rather than one: the fields belong to different steps and have
 * different rules, and a single schema would have to call the code optional
 * right where it is required.
 *
 * The provider buttons arrive as `oauth` rather than being imported, because
 * whether Line can be offered is a server-side question (see ./page.tsx). They
 * render under step one only — once a code has been mailed, starting a second
 * sign-in a different way would just abandon the first.
 */

/** What the browser calls itself, trimmed to something a person can recognise. */
function deviceLabel(): string | undefined {
  if (typeof navigator === "undefined") return undefined
  const ua = navigator.userAgent
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser"
  const platform =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "unknown"
  return `${browser} on ${platform}`
}

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

export function LoginForm({ oauth }: { oauth?: ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get("callbackUrl") ?? "/"

  const [credentials, setCredentials] = useState<LoginValues | null>(null)
  const [expiresIn, setExpiresIn] = useState(10)
  const [remember, setRemember] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  // A provider sign-in that failed comes back as a redirect, so its reason
  // arrives in the URL rather than from a call this page made.
  const [failure, setFailure] = useState<string | null>(params.get("error"))

  const stepOne = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.get("email") ?? "", password: "" }
  })

  const codeForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" }
  })

  /** Hands the already-issued tokens to NextAuth and leaves. */
  async function finish(tokens: ApiTokens) {
    const signedIn = await signIn("oauth-tokens", {
      payload: JSON.stringify(tokens),
      redirect: false
    })

    if (signedIn?.error) {
      setFailure("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่")
      return
    }
    router.push(callbackUrl)
    router.refresh()
  }

  async function sendCode(values: LoginValues) {
    setFailure(null)
    const result = await post("/api/auth/password/login", values)

    if (!result.ok) {
      // The API answers "invalid email or password" for a missing account too,
      // so showing its message verbatim gives nothing away.
      setFailure(messageFrom(result.body, "เข้าสู่ระบบไม่สำเร็จ"))
      return
    }

    // A browser this account has been seen on: no code was sent, and the
    // tokens are already here.
    const body = result.body as PendingResponse | ApiTokens
    if ("accessToken" in body) {
      await finish(body)
      return
    }

    setExpiresIn((body as { expiresInMinutes: number }).expiresInMinutes)
    setCredentials(values)
    setNotice(`ส่งรหัสไปที่ ${values.email} แล้ว`)
  }

  async function completeSignIn(values: OtpValues) {
    if (!credentials) return
    setFailure(null)

    const result = await post("/api/auth/password/verify", {
      ...credentials,
      otp: values.otp,
      rememberDevice: remember,
      deviceLabel: remember ? deviceLabel() : undefined
    })

    if (!result.ok) {
      setFailure(
        messageFrom(result.body, "รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว")
      )
      return
    }

    await finish(result.body as ApiTokens)
  }

  async function resend() {
    if (!credentials) return
    setFailure(null)
    try {
      await resendLoginCode(credentials)
      setNotice("ส่งรหัสใหม่แล้ว")
    } catch (cause) {
      setFailure(
        cause instanceof ApiError ? cause.message : "ขอรหัสใหม่ไม่สำเร็จ"
      )
    }
  }

  if (credentials) {
    const busy = codeForm.formState.isSubmitting
    return (
      <form
        onSubmit={codeForm.handleSubmit(completeSignIn)}
        className="space-y-4"
        noValidate
      >
        <div>
          <h1 className="text-xl font-semibold">ยืนยันตัวตน</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            กรอกรหัส 6 หลักที่ส่งไปยัง {credentials.email} — ใช้ได้ภายใน{" "}
            {expiresIn} นาที
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

        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={remember}
            onCheckedChange={(value) => setRemember(value)}
          />
          <span>
            จำอุปกรณ์นี้ไว้ 30 วัน
            <span className="mt-0.5 block text-muted-foreground">
              ครั้งต่อไปจากเครื่องนี้จะไม่ต้องกรอกรหัสจากอีเมลอีก —
              เครื่องอื่นยังต้องกรอกเหมือนเดิม อย่าเลือกถ้าเป็นเครื่องสาธารณะ
            </span>
          </span>
        </label>

        {notice && !failure && (
          <p className="text-sm text-muted-foreground">{notice}</p>
        )}
        {failure && <p className="text-sm text-destructive">{failure}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "กำลังยืนยัน..." : "เข้าสู่ระบบ"}
        </Button>

        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              setCredentials(null)
              setFailure(null)
              codeForm.reset()
            }}
          >
            ย้อนกลับ
          </button>
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

  const busy = stepOne.formState.isSubmitting
  return (
    <div className="space-y-6">
      <form
        onSubmit={stepOne.handleSubmit(sendCode)}
        className="space-y-4"
        noValidate
      >
        <div>
          <h1 className="text-xl font-semibold">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ครั้งแรกจากเครื่องนี้ต้องยืนยันด้วยรหัสทางอีเมลอีกขั้นหนึ่ง
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">อีเมล</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            {...stepOne.register("email")}
          />
          {stepOne.formState.errors.email && (
            <p className="text-sm text-destructive">
              {stepOne.formState.errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">รหัสผ่าน</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...stepOne.register("password")}
          />
          {stepOne.formState.errors.password && (
            <p className="text-sm text-destructive">
              {stepOne.formState.errors.password.message}
            </p>
          )}
        </div>

        {failure && <p className="text-sm text-destructive">{failure}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "กำลังตรวจสอบ..." : "ถัดไป"}
        </Button>

        <div className="flex justify-between text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline"
          >
            ลืมรหัสผ่าน
          </Link>
          <Link href="/register" className="text-muted-foreground underline">
            สมัครสมาชิก
          </Link>
        </div>
      </form>

      {oauth}
    </div>
  )
}
