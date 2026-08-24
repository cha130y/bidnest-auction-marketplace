"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { register as createAccount } from "@/lib/api/auth/auth-api"
import { ApiError } from "@/lib/api/client"
import { registerSchema, type RegisterValues } from "@/lib/auth/schemas"

/**
 * AUTH-001 — creating an account.
 *
 * Registering deliberately does not sign anyone in: logging in still goes
 * through the password and the emailed code, so this ends by handing over to
 * the login screen with the address already filled in.
 */
export function RegisterForm() {
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      displayName: ""
    }
  })

  async function submit(values: RegisterValues) {
    setFailure(null)
    try {
      await createAccount({
        ...values,
        // The column is nullable; an empty box should leave it that way.
        lastName: values.lastName?.trim() || undefined
      })
      router.push(`/login?email=${encodeURIComponent(values.email)}`)
    } catch (cause) {
      setFailure(
        cause instanceof ApiError ? cause.message : "สมัครสมาชิกไม่สำเร็จ"
      )
    }
  }

  const busy = form.formState.isSubmitting
  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">สมัครสมาชิก</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          บัญชีเดียวใช้ได้ทั้งประมูลและซื้อขายสินค้า
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
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
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
        <Label htmlFor="firstName">ชื่อจริง</Label>
        <Input
          id="firstName"
          autoComplete="given-name"
          {...form.register("firstName")}
        />
        {errors.firstName && (
          <p className="text-sm text-destructive">{errors.firstName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="lastName">นามสกุล (ไม่บังคับ)</Label>
        <Input
          id="lastName"
          autoComplete="family-name"
          {...form.register("lastName")}
        />
        {errors.lastName && (
          <p className="text-sm text-destructive">{errors.lastName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">ชื่อที่แสดง</Label>
        <Input
          id="displayName"
          autoComplete="nickname"
          {...form.register("displayName")}
        />
        {errors.displayName ? (
          <p className="text-sm text-destructive">
            {errors.displayName.message}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            ชื่อนี้จะแสดงบนหน้าประมูลและหน้าสินค้าให้คนอื่นเห็น
          </p>
        )}
      </div>

      {failure && <p className="text-sm text-destructive">{failure}</p>}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "กำลังสมัคร..." : "สมัครสมาชิก"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีอยู่แล้ว{" "}
        <Link href="/login" className="underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
