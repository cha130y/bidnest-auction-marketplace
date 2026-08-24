"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { getMe, updateMe } from "@/lib/api/users"
import { MOCK_ME } from "@/lib/api/users.mock"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Me } from "@/lib/api/types"

/**
 * TEMPORARY (USR-001) — renders `MOCK_ME` and skips the sign-in gate below,
 * so this page has something to show without going through AUTH-002's
 * mandatory email OTP locally. `GET/PATCH /users/me` already work
 * (`apps/api/src/users/`); nothing here is waiting on backend work.
 *
 * ต่อ BE จริงแล้ว (once wiring up the real backend): flip this to `false`.
 * `getMe`/`updateMe` below already call the real endpoint and only sit
 * unused while this is `true` — nothing else in this file needs to change.
 */
const USE_MOCK_DATA = true

const ROLE_LABEL: Record<Me["role"], string> = {
  USER: "ผู้ใช้ทั่วไป",
  ADMIN: "ผู้ดูแลระบบ",
}

const STATUS_LABEL: Record<Me["status"], string> = {
  ACTIVE: "ใช้งานได้ปกติ",
  SUSPENDED: "ถูกระงับ",
  DEACTIVATED: "ปิดใช้งาน",
}

type ProfileFormInput = {
  firstName: string
  lastName: string
  displayName: string
  avatarUrl: string
  bio: string
  phone: string
  location: string
  defaultShippingAddress: string
}

/** Mirrors the @MaxLength() on each field in UpdateProfileDto exactly. */
const FIELD_MAX_LENGTH: Record<keyof ProfileFormInput, number> = {
  firstName: 100,
  lastName: 100,
  displayName: 100,
  avatarUrl: 2048,
  bio: 500,
  phone: 30,
  location: 200,
  defaultShippingAddress: 1000,
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Client-side mirror of UpdateProfileDto's rules, so a mistake shows up next
 * to the field that has it instead of only after a round trip to the API.
 * The API re-checks all of this regardless — this exists to save the trip,
 * not to be the rule.
 */
function validateProfileForm(
  input: ProfileFormInput
): Partial<Record<keyof ProfileFormInput, string>> {
  const errors: Partial<Record<keyof ProfileFormInput, string>> = {}

  if (input.firstName.trim() === "") errors.firstName = "กรุณากรอกชื่อจริง"
  if (input.displayName.trim() === "") errors.displayName = "กรุณากรอกชื่อที่แสดง"

  if (input.avatarUrl.trim() !== "" && !isValidUrl(input.avatarUrl.trim())) {
    errors.avatarUrl = "ต้องเป็น URL ที่ถูกต้อง เช่น https://example.com/photo.jpg"
  }

  for (const key of Object.keys(FIELD_MAX_LENGTH) as (keyof ProfileFormInput)[]) {
    const limit = FIELD_MAX_LENGTH[key]
    if (input[key].length > limit && !errors[key]) {
      errors[key] = `ยาวเกิน ${limit} ตัวอักษร`
    }
  }

  return errors
}

/**
 * USR-001 — the signed-in user's own profile: read + edit in one view.
 *
 * A Client Component, and not by preference: the access token lives in
 * localStorage, so `authHeader()` is empty during SSR and a server-rendered
 * version of this page would 401 for everybody. Same shape as
 * `WatchlistView` for the same reason.
 *
 * `GET /users/me` never takes an id — it is always the caller's own profile.
 * `id` here is only what the URL claims; if it does not match what the token
 * actually resolves to, the address bar is corrected rather than ever
 * rendering another account's data under it.
 */
export function ProfileView({ id }: { id: string }) {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const [me, setMe] = useState<Me | null>(USE_MOCK_DATA ? MOCK_ME : null)
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ProfileFormInput, string>>
  >({})

  useEffect(() => {
    if (USE_MOCK_DATA) return // seeded into state above, no fetch needed
    if (!ready || !token) return

    let cancelled = false

    getMe()
      .then((result) => {
        if (cancelled) return
        setMe(result)
        if (result.id !== id) router.replace(`/user/${result.id}`)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught)
      })

    return () => {
      cancelled = true
    }
  }, [ready, token, id, router])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const form = new FormData(event.currentTarget)
    const text = (name: string) => String(form.get(name) ?? "")
    const input: ProfileFormInput = {
      firstName: text("firstName"),
      lastName: text("lastName"),
      displayName: text("displayName"),
      avatarUrl: text("avatarUrl"),
      bio: text("bio"),
      phone: text("phone"),
      location: text("location"),
      defaultShippingAddress: text("defaultShippingAddress"),
    }

    const errors = validateProfileForm(input)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      if (USE_MOCK_DATA) {
        // No backend to talk to — mirrors PATCH /users/me's own rule
        // (an empty string clears an optional field) so the form behaves the
        // same way it will once USE_MOCK_DATA is false.
        const clear = (value: string) => (value.trim() === "" ? null : value)
        setMe((current) =>
          current && {
            ...current,
            profile: {
              ...current.profile,
              firstName: input.firstName,
              lastName: clear(input.lastName),
              displayName: input.displayName,
              avatarUrl: clear(input.avatarUrl),
              bio: clear(input.bio),
              phone: clear(input.phone),
              location: clear(input.location),
              defaultShippingAddress: clear(input.defaultShippingAddress),
              updatedAt: new Date().toISOString(),
            },
          }
        )
      } else {
        const updated = await updateMe(input)
        setMe(updated)
      }
    } catch (caught) {
      setFormError(
        caught instanceof ApiError
          ? caught.message
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!USE_MOCK_DATA) {
    if (!ready) return <Skeleton />

    if (!token) {
      return (
        <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
          <p className="text-n-600">เข้าสู่ระบบเพื่อดูและแก้ไขโปรไฟล์ของคุณ</p>
          <Button
            variant="primary"
            size="lg"
            className="mt-4"
            onClick={() => router.push(loginHref())}
          >
            เข้าสู่ระบบ
          </Button>
        </div>
      )
    }
  }

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!me) return <Skeleton />

  return (
    <div className="flex flex-col gap-5">
      {USE_MOCK_DATA && (
        <p className="rounded-r4 border border-amber-500 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-600">
          ข้อมูลตัวอย่าง (mock) — ยังไม่ได้ต่อกับ backend จริง
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-r4 bg-white px-6 py-5 shadow-sh1">
        <div>
          <p className="text-sm text-n-500">{me.email}</p>
          <p className="text-xs text-n-500">
            สมัครสมาชิกเมื่อ {formatDate(me.createdAt)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant="verified">{ROLE_LABEL[me.role]}</Badge>
          <Badge variant="verified">{STATUS_LABEL[me.status]}</Badge>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-5 rounded-r4 bg-white px-6 py-6 shadow-sh1"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="ชื่อจริง" htmlFor="firstName" error={fieldErrors.firstName}>
            <Input
              id="firstName"
              name="firstName"
              required
              maxLength={100}
              invalid={Boolean(fieldErrors.firstName)}
              defaultValue={me.profile.firstName}
            />
          </Field>

          <Field
            label="นามสกุล"
            htmlFor="lastName"
            hint="ไม่บังคับ"
            error={fieldErrors.lastName}
          >
            <Input
              id="lastName"
              name="lastName"
              maxLength={100}
              invalid={Boolean(fieldErrors.lastName)}
              defaultValue={me.profile.lastName ?? ""}
            />
          </Field>

          <Field
            label="ชื่อที่แสดง"
            htmlFor="displayName"
            hint="ชื่อนี้จะแสดงบนหน้าประมูล/สินค้าแบบสาธารณะ"
            error={fieldErrors.displayName}
          >
            <Input
              id="displayName"
              name="displayName"
              required
              maxLength={100}
              invalid={Boolean(fieldErrors.displayName)}
              defaultValue={me.profile.displayName}
            />
          </Field>

          <Field
            label="รูปโปรไฟล์ (URL)"
            htmlFor="avatarUrl"
            hint="ไม่บังคับ"
            error={fieldErrors.avatarUrl}
          >
            <Input
              id="avatarUrl"
              name="avatarUrl"
              type="url"
              maxLength={2048}
              invalid={Boolean(fieldErrors.avatarUrl)}
              defaultValue={me.profile.avatarUrl ?? ""}
              placeholder="https://…"
            />
          </Field>

          <Field
            label="เบอร์โทร"
            htmlFor="phone"
            hint="ไม่บังคับ"
            error={fieldErrors.phone}
          >
            <Input
              id="phone"
              name="phone"
              maxLength={30}
              invalid={Boolean(fieldErrors.phone)}
              defaultValue={me.profile.phone ?? ""}
            />
          </Field>

          <Field
            label="ที่อยู่ (จังหวัด/พื้นที่)"
            htmlFor="location"
            hint="ไม่บังคับ"
            error={fieldErrors.location}
          >
            <Input
              id="location"
              name="location"
              maxLength={200}
              invalid={Boolean(fieldErrors.location)}
              defaultValue={me.profile.location ?? ""}
            />
          </Field>
        </div>

        <Field
          label="แนะนำตัว"
          htmlFor="bio"
          hint="ไม่บังคับ · สูงสุด 500 ตัวอักษร"
          error={fieldErrors.bio}
        >
          <textarea
            id="bio"
            name="bio"
            rows={3}
            maxLength={500}
            defaultValue={me.profile.bio ?? ""}
            className={cn(
              "w-full rounded-r3 border border-n-300 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-amber-500 focus:shadow-focus",
              fieldErrors.bio && "border-red bg-red-50 focus:border-red"
            )}
          />
        </Field>

        <Field
          label="ที่อยู่จัดส่งเริ่มต้น"
          htmlFor="defaultShippingAddress"
          hint="ใช้ prefill ตอน checkout ฝั่งช้อปปิ้ง · ไม่บังคับ"
          error={fieldErrors.defaultShippingAddress}
        >
          <textarea
            id="defaultShippingAddress"
            name="defaultShippingAddress"
            rows={3}
            maxLength={1000}
            defaultValue={me.profile.defaultShippingAddress ?? ""}
            className={cn(
              "w-full rounded-r3 border border-n-300 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-amber-500 focus:shadow-focus",
              fieldErrors.defaultShippingAddress &&
                "border-red bg-red-50 focus:border-red"
            )}
          />
        </Field>

        {formError && (
          <p role="alert" className="text-sm font-medium text-red">
            {formError}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={submitting}
          className="self-start"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึกการเปลี่ยนแปลง"}
        </Button>
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-n-500">{hint}</p>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="h-20 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse" />
      <div className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse" />
    </div>
  )
}
