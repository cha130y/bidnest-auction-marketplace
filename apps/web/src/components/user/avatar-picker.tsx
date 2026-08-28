"use client"

import { useRef, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
// The same POST /uploads/images every picture on the site goes through — it
// is one endpoint with one limit, and it happens to live in products.ts
// because a listing was the first thing that needed it.
import { uploadPendingImage } from "@/lib/api/products"
import { AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from "@/lib/api/types"

const megabytes = (bytes: number) => Math.round(bytes / 1024 / 1024)

/**
 * USR-001 — the picture on your own profile.
 *
 * This field used to be a box you pasted a URL into, which asked the person
 * filling in their profile to have already put the picture somewhere on the
 * internet themselves. The value is still a URL underneath — the file goes to
 * /uploads/images and what comes back is what the form holds — so nothing
 * about saving a profile changed to accommodate this.
 *
 * The size and type checks here save a pointless round trip; they are not the
 * rule. The API applies both again and its answer is the one that counts.
 * What is worth doing on this side is saying "5 MB" before the upload rather
 * than after it.
 */
export function AvatarPicker({
  value,
  onChange,
  /** Shown in the empty circle, so it is a person rather than a placeholder. */
  fallback,
  disabled
}: {
  value: string
  onChange: (url: string) => void
  fallback: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setError(null)

    if (file.size > MAX_AVATAR_BYTES) {
      setError(`ไฟล์ใหญ่เกิน ${megabytes(MAX_AVATAR_BYTES)} MB`)
      return
    }

    if (!AVATAR_MIME_TYPES.some((type) => type === file.type)) {
      setError("รองรับเฉพาะไฟล์ JPG, PNG, WebP และ AVIF")
      return
    }

    setBusy(true)
    try {
      const stored = await uploadPendingImage(file)
      onChange(stored.url)
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "อัปโหลดรูปไม่สำเร็จ"
      )
    } finally {
      setBusy(false)
      // Clears the picker so choosing the same file twice still fires change.
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">รูปโปรไฟล์</p>

      <div className="flex items-center gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-full bg-n-100">
          {value ? (
            // A plain <img> for the reason ProductImage gives: avatarUrl has
            // no host allowlist, so next/image would need remotePatterns open
            // to the whole internet to match it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="รูปโปรไฟล์ปัจจุบัน"
              className="size-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-full items-center justify-center bg-linear-to-b from-amber-400 to-amber-500 text-2xl font-bold text-ink"
            >
              {fallback}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-4" />
              {busy ? "กำลังอัปโหลด…" : value ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
            </Button>

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                onClick={() => {
                  setError(null)
                  onChange("")
                }}
              >
                <Trash2 className="size-4" />
                ลบรูป
              </Button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-n-600">
            ไม่บังคับ · JPG, PNG, WebP หรือ AVIF · ไม่เกิน{" "}
            {megabytes(MAX_AVATAR_BYTES)} MB
          </p>
        </div>
      </div>

      {/* Outside the label flow and hidden rather than `display: none`, so the
          button above stays the only control anyone tabs to. */}
      <input
        ref={input}
        type="file"
        accept={AVATAR_MIME_TYPES.join(",")}
        hidden
        onChange={(event) => void handleFile(event.target.files)}
      />

      {/* Announced, because the failure happens after the file dialog has
          closed and there is nothing else on screen that would have changed. */}
      <p aria-live="polite" className="sr-only">
        {busy ? "กำลังอัปโหลดรูป" : ""}
      </p>

      {error && (
        <p role="alert" className="text-sm font-medium text-red">
          {error}
        </p>
      )}
    </div>
  )
}
