"use client"

import { useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { AuthCard, AuthLink } from "@/components/auth/auth-card"
import { Field, FormError } from "@/components/auth/field"
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
      <AuthCard
        title="ยืนยันตัวตน"
        subtitle={`กรอกรหัส 6 หลักที่ส่งไปยัง ${credentials.email} — ใช้ได้ภายใน ${expiresIn} นาที`}
      >
        <form
          onSubmit={codeForm.handleSubmit(completeSignIn)}
          className="space-y-5"
          noValidate
        >
          <Field
            id="otp"
            label="รหัสยืนยัน"
            error={codeForm.formState.errors.otp?.message}
          >
            {(field) => (
              <Input
                {...field}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                placeholder="000000"
                // Six digits read as a code rather than a word: spaced out,
                // centred, and in the tabular figures the display face has,
                // so nothing shifts as the boxes fill.
                className="text-center font-display text-2xl font-bold tracking-[0.4em] tabular-nums"
                {...codeForm.register("otp")}
              />
            )}
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-r2 bg-n-100 p-4 text-sm">
            <Checkbox
              checked={remember}
              onCheckedChange={(value) => setRemember(value)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold text-ink">
                จำอุปกรณ์นี้ไว้ 30 วัน
              </span>
              <span className="mt-1 block leading-relaxed text-n-600">
                ครั้งต่อไปจากเครื่องนี้จะไม่ต้องกรอกรหัสจากอีเมลอีก —
                เครื่องอื่นยังต้องกรอกเหมือนเดิม อย่าเลือกถ้าเป็นเครื่องสาธารณะ
              </span>
            </span>
          </label>

          {notice && !failure && (
            <p role="status" className="text-sm text-n-600">
              {notice}
            </p>
          )}
          <FormError>{failure}</FormError>

          <Button type="submit" size="lg" block disabled={busy}>
            {busy ? "กำลังยืนยัน..." : "เข้าสู่ระบบ"}
          </Button>

          <div className="flex items-center justify-between gap-4 text-sm">
            <button
              type="button"
              className="rounded-r1 font-semibold text-n-600 underline decoration-n-300 underline-offset-4 transition-colors outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-amber-500/30"
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
              className="rounded-r1 font-semibold text-n-600 underline decoration-n-300 underline-offset-4 transition-colors outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-amber-500/30 disabled:opacity-45"
              onClick={resend}
              disabled={busy}
            >
              ขอรหัสใหม่
            </button>
          </div>
        </form>
      </AuthCard>
    )
  }

  const busy = stepOne.formState.isSubmitting
  return (
    <AuthCard
      title="เข้าสู่ระบบ"
      subtitle="ครั้งแรกจากเครื่องนี้ต้องยืนยันด้วยรหัสทางอีเมลอีกขั้นหนึ่ง"
      footer={
        <>
          ยังไม่มีบัญชี <AuthLink href="/register">สมัครสมาชิก</AuthLink>
        </>
      }
    >
      <form
        onSubmit={stepOne.handleSubmit(sendCode)}
        className="space-y-5"
        noValidate
      >
        <Field
          id="email"
          label="อีเมล"
          error={stepOne.formState.errors.email?.message}
        >
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              {...stepOne.register("email")}
            />
          )}
        </Field>

        <Field
          id="password"
          label="รหัสผ่าน"
          error={stepOne.formState.errors.password?.message}
        >
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="current-password"
              {...stepOne.register("password")}
            />
          )}
        </Field>

        <FormError>{failure}</FormError>

        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? "กำลังตรวจสอบ..." : "ถัดไป"}
        </Button>

        <div className="text-right text-sm">
          <AuthLink href="/forgot-password" className="text-n-600">
            ลืมรหัสผ่าน
          </AuthLink>
        </div>
      </form>

      {oauth}
    </AuthCard>
  )
}
