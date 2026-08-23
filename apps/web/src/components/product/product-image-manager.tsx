"use client"

import { useRef, useState } from "react"
import { ImagePlus, Star, X } from "lucide-react"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { addProductImage, removeProductImage } from "@/lib/api/products"
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
} from "@/lib/api/types"
import type { OwnerProduct } from "@/lib/api/types"

const megabytes = (bytes: number) => Math.round(bytes / 1024 / 1024)

/**
 * PROD-002 — the pictures on a listing that is already on sale: add one,
 * remove one.
 *
 * Uploads one file at a time and reports the listing back after each, so the
 * caller's copy stays current without a second read. The API answers with the
 * whole product rather than the image alone, which is what makes that cheap.
 *
 * The checks here are to save a pointless round trip, not to be the rule — the
 * API applies all of them again, and its answer is the one that counts. The
 * last-picture rule is deliberately left to the API: it depends on what is in
 * the database right now, and guessing at it here would only be wrong in the
 * one case that matters.
 */
export function ProductImageManager({
  productId,
  product,
  onChange,
}: {
  productId: string
  product: OwnerProduct
  onChange: (product: OwnerProduct) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const images = product.images
  const full = images.length >= MAX_PRODUCT_IMAGES

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)

    const room = MAX_PRODUCT_IMAGES - images.length
    const chosen = Array.from(files).slice(0, room)

    if (files.length > room) {
      setError(`ใส่รูปได้สูงสุด ${MAX_PRODUCT_IMAGES} รูป`)
    }

    setBusy(true)
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

        onChange(await addProductImage(productId, file))
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

  const remove = async (imageId: string) => {
    setError(null)
    setBusy(true)
    try {
      onChange(await removeProductImage(productId, imageId))
    } catch (cause) {
      // PROD-001 says a listing keeps at least one picture, so the API refuses
      // the last one and explains why. Passing that through is better than
      // anything this component could word for itself.
      setError(cause instanceof ApiError ? cause.message : "ลบรูปไม่สำเร็จ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-r4 bg-white p-6 shadow-sh1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-ink">รูปสินค้า</h2>
          <p className="text-xs text-n-500">
            สูงสุด {MAX_PRODUCT_IMAGES} รูป · ไฟล์ละไม่เกิน{" "}
            {megabytes(MAX_PRODUCT_IMAGE_BYTES)} MB · รูปแรกคือรูปหน้าปก
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || full}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="size-4" />
          {busy ? "กำลังทำงาน…" : "เพิ่มรูป"}
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

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image, index) => (
          <li
            key={image.id}
            className="relative overflow-hidden rounded-r3 border border-n-200"
          >
            <ProductImage
              src={image.url}
              alt={`รูปสินค้าที่ ${index + 1}`}
              className="aspect-square w-full object-cover"
            />

            {image.isPrimary && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">
                <Star className="size-3" aria-hidden="true" />
                หน้าปก
              </span>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(image.id)}
              aria-label={`ลบรูปที่ ${index + 1}`}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-n-600 shadow-sh1 hover:text-rose-600"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}
