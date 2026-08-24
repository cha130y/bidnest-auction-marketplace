"use client"

import { useRef, useState } from "react"
import { ImagePlus, Star, X } from "lucide-react"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { uploadPendingImage } from "@/lib/api/products"
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
} from "@/lib/api/types"

const megabytes = (bytes: number) => Math.round(bytes / 1024 / 1024)

/**
 * PROD-001 — the pictures on a listing that does not exist yet.
 *
 * An auction is drafted first and photographed second, so its manager can send
 * each file straight onto the draft. A listing has to be created with its
 * pictures already on it, which leaves this holding files and no id to file
 * them under: each one goes to /uploads/images and the url comes back, and the
 * form sends the collection as `imageUrls` when the seller saves.
 *
 * The checks here are to save a pointless round trip, not to be the rule — the
 * API applies all three again, and its answer is the one that counts. What is
 * worth doing on this side is *explaining*: "5 MB" is more use before the
 * upload than after it.
 */
export function PendingImagePicker({
  urls,
  onChange,
  disabled,
}: {
  urls: string[]
  onChange: (urls: string[]) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const full = urls.length >= MAX_PRODUCT_IMAGES

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)

    const room = MAX_PRODUCT_IMAGES - urls.length
    const chosen = Array.from(files).slice(0, room)

    if (files.length > room) {
      setError(`ใส่รูปได้สูงสุด ${MAX_PRODUCT_IMAGES} รูป`)
    }

    setBusy(true)
    // Accumulated locally rather than by calling onChange per file: a parent
    // that re-renders between uploads would otherwise hand back a stale list
    // and drop whichever picture landed in between.
    let collected = urls

    try {
      for (const file of chosen) {
        if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
          setError(
            `"${file.name}" ใหญ่เกิน ${megabytes(MAX_PRODUCT_IMAGE_BYTES)} MB`
          )
          break
        }

        if (!PRODUCT_IMAGE_MIME_TYPES.some((type) => type === file.type)) {
          setError(`"${file.name}" ไม่ใช่ไฟล์รูปที่รองรับ`)
          break
        }

        const stored = await uploadPendingImage(file)
        collected = [...collected, stored.url]
        onChange(collected)
      }
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            รูปสินค้า <span className="text-rose-600">*</span>
          </p>
          <p className="text-xs text-n-500">
            อย่างน้อย 1 รูป สูงสุด {MAX_PRODUCT_IMAGES} รูป · ไฟล์ละไม่เกิน{" "}
            {megabytes(MAX_PRODUCT_IMAGE_BYTES)} MB · รูปแรกคือรูปหน้าปก
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || busy || full}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="size-4" />
          {busy ? "กำลังอัปโหลด…" : "เพิ่มรูป"}
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept={PRODUCT_IMAGE_MIME_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {urls.length === 0 ? (
        <p className="rounded-r3 border border-dashed border-n-300 px-4 py-8 text-center text-sm text-n-500">
          ยังไม่มีรูป — กด &ldquo;เพิ่มรูป&rdquo; เพื่อเลือกจากเครื่อง
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {urls.map((url, index) => (
            <li
              key={url}
              className="group relative overflow-hidden rounded-r3 border border-n-200"
            >
              <ProductImage
                src={url}
                alt={`รูปสินค้าที่ ${index + 1}`}
                className="aspect-square w-full object-cover"
              />

              {index === 0 && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">
                  <Star className="size-3" aria-hidden="true" />
                  หน้าปก
                </span>
              )}

              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onChange(urls.filter((it) => it !== url))}
                aria-label={`ลบรูปที่ ${index + 1}`}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-n-600 shadow-sh1 hover:text-rose-600"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}