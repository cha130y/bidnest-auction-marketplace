"use client"

import { useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestLoginCode, resendLoginCode } from "@/lib/api/auth/auth-api"
import { ApiError } from "@/lib/api/client"
import {
  loginSchema,
  otpSchema,
  type LoginValues,
  type OtpValues
} from "@/lib/auth/schemas"

/**
 * AUTH-002 / AUTH-007 — signing in, in the two steps the SRS describes.
 *
 * The password and the emailed code are collected on separate screens but sent
 * together in one `signIn()` call, because NextAuth's Credentials provider runs
 * `authorize()` exactly once. Step one is a plain call to the API, which checks
 * the password and mails a code without issuing anything.
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
export function LoginForm({ oauth }: { oauth?: ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get("callbackUrl") ?? "/"

  const [credentials, setCredentials] = useState<LoginValues | null>(null)
  const [expiresIn, setExpiresIn] = useState(10)
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

  async function sendCode(values: LoginValues) {
    setFailure(null)
    try {
      const pending = await requestLoginCode(values)
      setExpiresIn(pending.expiresInMinutes)
      setCredentials(values)
      setNotice(`ส่งรหัสไปที่ ${values.email} แล้ว`)
    } catch (cause) {
      // The API answers "invalid email or password" for a missing account too,
      // so showing its message verbatim gives nothing away.
      setFailure(
        cause instanceof ApiError ? cause.message : "เข้าสู่ระบบไม่สำเร็จ"
      )
    }
  }

  async function completeSignIn(values: OtpValues) {
    if (!credentials) return
    setFailure(null)

    const result = await signIn("credentials", {
      ...credentials,
      otp: values.otp,
      redirect: false
    })

    if (result?.error) {
      // authorize() returns null rather than a reason on purpose: a wrong code
      // and a wrong password must not be tellable apart from out here.
      setFailure("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว")
      return
    }
    router.push(callbackUrl)
    router.refresh()
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
            ทุกบัญชีต้องยืนยันด้วยรหัสทางอีเมลอีกขั้นหนึ่ง
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
