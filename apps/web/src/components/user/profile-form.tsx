"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api/client"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import {
  getMyProfile,
  myProfileQueryKey,
  updateMyProfile,
  type MyProfile,
  type UpdateMyProfile
} from "@/lib/api/users"
import { profileSchema, type ProfileValues } from "@/lib/auth/schemas"
import { AvatarPicker } from "@/components/user/avatar-picker"
import { formatDateTime, initialOf } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * USR-001 — your own profile, and the form to change it.
 *
 * Everything on this screen is private to the person looking at it. Only
 * `displayName` ever leaves it: auctions, listings and bids all show that one
 * field, which is what the note under it is there to say — someone filling in
 * a real name should know where it does and does not appear.
 *
 * The address here prefills checkout (CART-004). An order keeps its own
 * snapshot of the address it shipped to, so editing this later never rewrites
 * where past parcels went.
 */

const TEXTAREA_CLASS =
  "w-full rounded-r3 border-[1.5px] border-transparent bg-n-100 px-5 py-4 font-body text-base text-ink shadow-well transition-colors outline-none placeholder:text-n-500 focus:border-amber-500 focus:bg-white focus:shadow-focus"

/** The API's shape, as the form wants it: no nulls, since inputs cannot hold one. */
function toFormValues(profile: MyProfile): ProfileValues {
  return {
    firstName: profile.profile.firstName,
    lastName: profile.profile.lastName ?? "",
    displayName: profile.profile.displayName,
    avatarUrl: profile.profile.avatarUrl ?? "",
    bio: profile.profile.bio ?? "",
    phone: profile.profile.phone ?? "",
    recipientName: profile.profile.recipientName ?? "",
    line1: profile.profile.line1 ?? "",
    line2: profile.profile.line2 ?? "",
    city: profile.profile.city ?? "",
    postalCode: profile.profile.postalCode ?? ""
  }
}

/** Blank means "clear it", which the API spells `null`. */
const orNull = (value: string) => (value.trim() === "" ? null : value.trim())

function toPatch(values: ProfileValues): UpdateMyProfile {
  return {
    firstName: values.firstName,
    displayName: values.displayName,
    lastName: orNull(values.lastName),
    avatarUrl: orNull(values.avatarUrl),
    bio: orNull(values.bio),
    phone: orNull(values.phone),
    recipientName: orNull(values.recipientName),
    line1: orNull(values.line1),
    line2: orNull(values.line2),
    city: orNull(values.city),
    postalCode: orNull(values.postalCode)
  }
}

export function ProfileForm() {
  const { token, ready } = useAuthToken()
  const isAuthenticated = ready && Boolean(token)
  const queryClient = useQueryClient()
  const { update: updateSession } = useSession()

  const { data, isPending, error } = useQuery({
    queryKey: myProfileQueryKey,
    queryFn: getMyProfile,
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false
  })

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      displayName: "",
      avatarUrl: "",
      bio: "",
      phone: "",
      recipientName: "",
      line1: "",
      line2: "",
      city: "",
      postalCode: ""
    }
  })

  // `useWatch` rather than `form.watch()`: watch() hands back a fresh function
  // every render, which makes React Compiler skip memoising this whole
  // component. The hook subscribes to one field and returns a plain value.
  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" })

  const { reset } = form
  useEffect(() => {
    // The form is built before the profile arrives, so its values land here
    // rather than in defaultValues. `reset` also clears the dirty flags, which
    // is what stops a fresh load from looking like unsaved work.
    if (data) reset(toFormValues(data))
  }, [data, reset])

  const save = useMutation({
    mutationFn: (values: ProfileValues) => updateMyProfile(toPatch(values)),
    onSuccess: async (updated) => {
      queryClient.setQueryData(myProfileQueryKey, updated)
      reset(toFormValues(updated))
      // The header reads both off the session, not off this query, so a
      // rename or a new picture would otherwise only show up after signing in
      // again. Taken from the API's answer rather than the form values, so
      // what the header draws is what was actually saved.
      await updateSession({
        name: updated.profile.displayName,
        image: updated.profile.avatarUrl
      })
    }
  })

  // `isPending`, not `isLoading`. React Query's `isLoading` is
  // `isPending && isFetching`, so it is false on the render where the query has
  // only just been enabled — the token has arrived but the request has not left
  // yet. This screen fell through on that render and showed the form with its
  // empty defaults for an instant, before the saved profile replaced them.
  if (!ready || (isAuthenticated && isPending)) {
    return (
      <div
        className="h-160 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <h2 className="font-display text-xl font-bold text-ink">
          เข้าสู่ระบบเพื่อดูโปรไฟล์
        </h2>
        <p className="mt-2 text-n-600">
          ข้อมูลในหน้านี้เป็นของเจ้าของบัญชีเท่านั้น
        </p>
        <Button
          variant="primary"
          size="lg"
          className="mt-6"
          nativeButton={false}
          render={<Link href="/login?callbackUrl=%2Fprofile" />}
        >
          เข้าสู่ระบบ
        </Button>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <h2 className="font-display text-xl font-bold text-ink">
          โหลดโปรไฟล์ไม่สำเร็จ
        </h2>
        <p className="mt-2 text-n-600">
          {error instanceof ApiError ? error.message : "กรุณาลองใหม่อีกครั้ง"}
        </p>
      </Card>
    )
  }

  const busy = save.isPending
  const dirty = form.formState.isDirty

  /**
   * USR-001 — the picture saves itself, the moment it is chosen.
   *
   * Only `avatarUrl` is sent: the rest of the form may be half-typed, and
   * choosing a picture must not commit someone's unfinished edits along with
   * it. `keepDirtyValues` puts the saved picture into the form's baseline
   * while leaving every field they are still working on exactly as it is —
   * so the Save button stays lit for those, and stays dark for this.
   *
   * Throws on failure rather than swallowing it, because AvatarPicker awaits
   * this and shows the reason on its own error line.
   */
  const saveAvatar = async (url: string) => {
    const updated = await updateMyProfile({ avatarUrl: url === "" ? null : url })
    queryClient.setQueryData(myProfileQueryKey, updated)
    reset(toFormValues(updated), { keepDirtyValues: true })
    // The header no longer reads the picture from here — it reads the cache
    // line set above — but the session is still what carries the name, and
    // sending both together keeps one write where there used to be two.
    await updateSession({ image: updated.profile.avatarUrl })
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="space-y-6"
      noValidate
    >
      <Card>
        <h2 className="font-display text-xl font-bold text-ink">บัญชี</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-n-500">อีเมล</dt>
            {/* Read-only on purpose: the address is what every one-time code
                goes to (AUTH-007), so changing it is a flow of its own and not
                a field on a profile form. */}
            <dd className="mt-1 break-all text-ink">{data.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-n-500">สมัครเมื่อ</dt>
            <dd className="mt-1 text-ink">{formatDateTime(data.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="font-display text-xl font-bold text-ink">ข้อมูลส่วนตัว</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="ชื่อจริง"
            id="firstName"
            error={form.formState.errors.firstName?.message}
          >
            <Input id="firstName" {...form.register("firstName")} />
          </Field>

          <Field
            label="นามสกุล"
            id="lastName"
            hint="ไม่บังคับ"
            error={form.formState.errors.lastName?.message}
          >
            <Input id="lastName" {...form.register("lastName")} />
          </Field>
        </div>

        <div className="mt-5">
          <Field
            label="ชื่อที่แสดง"
            id="displayName"
            hint="ชื่อเดียวที่คนอื่นเห็นบนประกาศประมูล สินค้า และการบิด"
            error={form.formState.errors.displayName?.message}
          >
            <Input id="displayName" {...form.register("displayName")} />
          </Field>
        </div>

        <div className="mt-5">
          {/* Saves on its own — see `saveAvatar`. The rest of this form waits
              for the Save button; the picture cannot, because choosing one
              already looks like the change was made. */}
          <AvatarPicker
            value={avatarUrl}
            onChange={saveAvatar}
            fallback={initialOf(data.profile.displayName, data.email)}
            disabled={busy}
          />
          {form.formState.errors.avatarUrl && (
            <p role="alert" className="mt-2 text-sm font-medium text-red">
              {form.formState.errors.avatarUrl.message}
            </p>
          )}
        </div>

        <div className="mt-5">
          <Field
            label="แนะนำตัว"
            id="bio"
            hint="ไม่บังคับ — ไม่เกิน 500 ตัวอักษร"
            error={form.formState.errors.bio?.message}
          >
            <textarea id="bio" rows={4} className={TEXTAREA_CLASS} {...form.register("bio")} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl font-bold text-ink">ติดต่อและจัดส่ง</h2>
        <p className="mt-1 text-sm text-n-600">
          ที่อยู่จัดส่งจะถูกเติมให้อัตโนมัติตอนสั่งซื้อ — คำสั่งซื้อเก่าเก็บที่อยู่ของตัวเองไว้แล้ว
          แก้ตรงนี้จึงไม่กระทบพัสดุที่ส่งไปแล้ว
        </p>

        {/* Same six fields, same labels, same order as the checkout form —
            deliberately, because this is where that form's values come from.
            Somebody who fills this in and then pays should recognise the
            second screen as the first one already answered. */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="ชื่อผู้รับ"
            id="recipientName"
            hint="ไม่บังคับ"
            error={form.formState.errors.recipientName?.message}
            className="sm:col-span-2"
          >
            <Input id="recipientName" {...form.register("recipientName")} />
          </Field>

          <Field
            label="ที่อยู่"
            id="line1"
            hint="ไม่บังคับ"
            error={form.formState.errors.line1?.message}
            className="sm:col-span-2"
          >
            <Input id="line1" {...form.register("line1")} />
          </Field>

          <Field
            label="ที่อยู่เพิ่มเติม"
            id="line2"
            hint="ไม่บังคับ"
            error={form.formState.errors.line2?.message}
            className="sm:col-span-2"
          >
            <Input id="line2" {...form.register("line2")} />
          </Field>

          <Field
            label="จังหวัด / เขต"
            id="city"
            hint="ไม่บังคับ"
            error={form.formState.errors.city?.message}
          >
            <Input id="city" {...form.register("city")} />
          </Field>

          <Field
            label="รหัสไปรษณีย์"
            id="postalCode"
            hint="ไม่บังคับ"
            error={form.formState.errors.postalCode?.message}
          >
            <Input id="postalCode" inputMode="numeric" {...form.register("postalCode")} />
          </Field>

          <Field
            label="เบอร์โทรศัพท์"
            id="phone"
            hint="ไม่บังคับ"
            error={form.formState.errors.phone?.message}
            className="sm:col-span-2"
          >
            <Input id="phone" inputMode="tel" {...form.register("phone")} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" size="lg" disabled={busy || !dirty}>
          {busy ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
        </Button>

        {dirty && !busy && (
          <button
            type="button"
            className="text-sm text-n-600 underline"
            onClick={() => reset(toFormValues(data))}
          >
            ยกเลิกการแก้ไข
          </button>
        )}

        {save.isSuccess && !dirty && (
          <p className="text-sm text-green-700">บันทึกแล้ว</p>
        )}
        {save.error && (
          <p className="text-sm text-red">
            {save.error instanceof ApiError
              ? save.error.message
              : "บันทึกไม่สำเร็จ กรุณาลองใหม่"}
          </p>
        )}
      </div>
    </form>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-r4 bg-white p-6 shadow-sh1 md:p-8">
      {children}
    </section>
  )
}

function Field({
  label,
  id,
  hint,
  error,
  className,
  children
}: {
  label: string
  id: string
  hint?: string
  error?: string
  /** Grid placement, for the address rows that want the full width. */
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-red">{error}</p>
      ) : (
        hint && <p className="text-sm text-n-500">{hint}</p>
      )}
    </div>
  )
}
