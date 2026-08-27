"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { AuthCard, AuthLink } from "@/components/auth/auth-card"
import { Field, FormError } from "@/components/auth/field"
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
      confirm: "",
      firstName: "",
      lastName: "",
      displayName: ""
    }
  })

  async function submit(values: RegisterValues) {
    setFailure(null)
    try {
      // `confirm` is a question this form asks itself. The API has no field
      // for it, and its ValidationPipe runs with whitelist on, so sending one
      // would be rejected rather than ignored.
      await createAccount({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        displayName: values.displayName,
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
    <AuthCard
      title="สมัครสมาชิก"
      subtitle="บัญชีเดียวใช้ได้ทั้งประมูลและซื้อขายสินค้า"
      footer={
        <>
          มีบัญชีอยู่แล้ว <AuthLink href="/login">เข้าสู่ระบบ</AuthLink>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit(submit)}
        className="space-y-5"
        noValidate
      >
        <Field id="email" label="อีเมล" error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              {...form.register("email")}
            />
          )}
        </Field>

        <Field
          id="password"
          label="รหัสผ่าน"
          error={errors.password?.message}
          hint="อย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรและตัวเลข"
        >
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              {...form.register("password")}
            />
          )}
        </Field>

        <Field
          id="confirm"
          label="ยืนยันรหัสผ่าน"
          error={errors.confirm?.message}
        >
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              {...form.register("confirm")}
            />
          )}
        </Field>

        {/* Two short boxes side by side from `sm` up: on a phone they stack,
            and on anything wider a full-width surname next to a full-width
            first name is a lot of empty line length for two words. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="firstName"
            label="ชื่อจริง"
            error={errors.firstName?.message}
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="given-name"
                {...form.register("firstName")}
              />
            )}
          </Field>

          <Field
            id="lastName"
            label="นามสกุล"
            optional
            error={errors.lastName?.message}
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="family-name"
                {...form.register("lastName")}
              />
            )}
          </Field>
        </div>

        <Field
          id="displayName"
          label="ชื่อที่แสดง"
          error={errors.displayName?.message}
          hint="ชื่อนี้จะแสดงบนหน้าประมูลและหน้าสินค้าให้คนอื่นเห็น"
        >
          {(field) => (
            <Input
              {...field}
              autoComplete="nickname"
              {...form.register("displayName")}
            />
          )}
        </Field>

        <FormError>{failure}</FormError>

        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? "กำลังสมัคร..." : "สมัครสมาชิก"}
        </Button>
      </form>
    </AuthCard>
  )
}
