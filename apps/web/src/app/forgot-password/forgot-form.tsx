"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/lib/api/auth/auth-api"
import {
  forgotPasswordSchema,
  type ForgotPasswordValues
} from "@/lib/auth/schemas"

/**
 * AUTH-005 — asking for a reset link.
 *
 * The screen says the same thing whether or not the address has an account,
 * because the API does. Reacting differently here — a "no such account" error,
 * or even a faster reply — would hand back exactly what the API is careful not
 * to say, and turn the form into a way of finding out who is registered.
 */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" }
  })

  async function submit(values: ForgotPasswordValues) {
    // Nothing to catch: the API answers 202 for every well-formed address, and
    // landing on a worse screen because the network blipped helps no one.
    await requestPasswordReset(values.email).catch(() => undefined)
    setSentTo(values.email)
  }

  if (sentTo) {
    return (
      <div>
        <h1 className="text-xl font-semibold">ตรวจอีเมลของคุณ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ถ้า {sentTo} มีบัญชีอยู่ในระบบ เราส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว
          ลิงก์ใช้ได้ครั้งเดียวและมีอายุจำกัด
        </p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    )
  }

  const busy = form.formState.isSubmitting

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">ลืมรหัสผ่าน</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          กรอกอีเมลที่ใช้สมัคร แล้วเราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "กำลังส่ง..." : "ส่งลิงก์"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
