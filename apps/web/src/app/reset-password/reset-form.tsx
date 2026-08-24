"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resetPassword } from "@/lib/api/auth/auth-api"
import { ApiError } from "@/lib/api/client"
import {
  resetPasswordSchema,
  type ResetPasswordValues
} from "@/lib/auth/schemas"

/**
 * AUTH-005 — spending the emailed link.
 *
 * Succeeding revokes every refresh session on the account, so the user has to
 * sign in again everywhere. That is the requirement, and it is worth saying on
 * screen rather than leaving someone to discover it on their other devices.
 */
export function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get("token") ?? ""
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" }
  })

  async function submit(values: ResetPasswordValues) {
    setFailure(null)
    try {
      await resetPassword({ token, password: values.password })
      router.push("/login")
    } catch (cause) {
      // Wrong, expired and already-spent links all answer the same way, so the
      // one message covers every case the user can act on.
      setFailure(
        cause instanceof ApiError && cause.status === 401
          ? "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่"
          : cause instanceof ApiError
            ? cause.message
            : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ"
      )
    }
  }

  if (!token) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">ลิงก์ไม่สมบูรณ์</h1>
        <p className="text-sm text-muted-foreground">
          ลิงก์นี้ไม่มีรหัสสำหรับตั้งรหัสผ่านใหม่ ลองขอลิงก์ใหม่อีกครั้ง
        </p>
        <Link href="/forgot-password" className="text-sm underline">
          ขอลิงก์ใหม่
        </Link>
      </div>
    )
  }

  const busy = form.formState.isSubmitting
  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">ตั้งรหัสผ่านใหม่</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เมื่อตั้งสำเร็จ ระบบจะออกจากระบบให้ทุกอุปกรณ์ แล้วต้องเข้าสู่ระบบใหม่
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่านใหม่</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          {...form.register("password")}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            อย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรและตัวเลข
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">ยืนยันรหัสผ่านใหม่</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...form.register("confirm")}
        />
        {errors.confirm && (
          <p className="text-sm text-destructive">{errors.confirm.message}</p>
        )}
      </div>

      {failure && <p className="text-sm text-destructive">{failure}</p>}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
      </Button>
    </form>
  )
}
