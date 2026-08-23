"use client"

import { useRef, useState } from "react"
import { ImagePlus, Star, X } from "lucide-react"

import { AuctionImage } from "@/components/auction/auction-image"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { removeDraftImage, uploadDraftImage } from "@/lib/api/seller-auctions"
import {
  AUCTION_IMAGE_MIME_TYPES,
  MAX_AUCTION_IMAGES,
  MAX_AUCTION_IMAGE_BYTES,
} from "@/lib/api/types"
import type { AuctionImage as AuctionImageRow } from "@/lib/api/types"

const megabytes = (bytes: number) => Math.round(bytes / 1024 / 1024)

/**
 * AUC-001 — the pictures on a draft: add one, remove one.
 *
 * Uploads one file at a time and reports the draft back after each, so the
 * caller's copy stays current without a second read. The API answers with the
 * whole auction rather than the image alone, which is what makes that cheap.
 *
 * The checks here are to save a pointless round trip, not to be the rule — the
 * API applies all three again, and its answer is the one that counts. What is
 * worth doing on this side is *explaining*: "5 MB" is more use before the
 * upload than after it.
 */
export function DraftImageManager({
  auctionId,
  images,
  onChange,
}: {
  auctionId: string
  images: AuctionImageRow[]
  onChange: (images: AuctionImageRow[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const full = images.length >= MAX_AUCTION_IMAGES

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)

    const room = MAX_AUCTION_IMAGES - images.length
    const chosen = Array.from(files).slice(0, room)

    if (files.length > room) {
      setError(`ใส่รูปได้สูงสุด ${MAX_AUCTION_IMAGES} รูป`)
    }

    setBusy(true)
    let latest = images

    try {
      for (const file of chosen) {
        if (!AUCTION_IMAGE_MIME_TYPES.includes(file.type as never)) {
          setError(`ไฟล์ ${file.name} ไม่ใช่รูปภาพที่รองรับ (JPEG, PNG, WebP, AVIF)`)
          continue
        }

        if (file.size > MAX_AUCTION_IMAGE_BYTES) {
          setError(
            `ไฟล์ ${file.name} ใหญ่เกิน ${megabytes(MAX_AUCTION_IMAGE_BYTES)} MB`
          )
          continue
        }

        // One at a time rather than in parallel: the API assigns positions and
        // decides which picture is primary, and concurrent uploads would be
        // racing for both.
        const draft = await uploadDraftImage(auctionId, file)
        latest = draft.images
        onChange(latest)
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "อัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setBusy(false)
      // Clears the picker so choosing the same file again still fires a change
      if (input.current) input.current.value = ""
    }
  }

  const remove = async (imageId: string) => {
    setBusy(true)
    setError(null)
    try {
      const draft = await removeDraftImage(auctionId, imageId)
      onChange(draft.images)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "ลบรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">รูปภาพ</span>
        <span className="text-xs text-n-500">
          {images.length}/{MAX_AUCTION_IMAGES} · ไม่เกิน{" "}
          {megabytes(MAX_AUCTION_IMAGE_BYTES)} MB ต่อรูป
        </span>
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-4 gap-3">
          {images.map((image) => (
            <li key={image.id} className="relative">
              <AuctionImage
                src={image.url}
                alt=""
                className="aspect-square w-full rounded-r2"
              />

              {image.isPrimary && (
                // The one every card and list will lead with, so it is worth
                // showing which it is rather than leaving it to be discovered.
                <span className="absolute top-1 left-1 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-ink">
                  <Star className="size-2.5" />
                  รูปหลัก
                </span>
              )}

              <button
                type="button"
                onClick={() => void remove(image.id)}
                disabled={busy}
                aria-label="ลบรูปนี้"
                className="absolute top-1 right-1 rounded-full bg-ink/80 p-1 text-white transition-colors hover:bg-red disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        accept={AUCTION_IMAGE_MIME_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={busy || full}
        onClick={() => input.current?.click()}
      >
        <ImagePlus className="size-4" />
        {busy ? "กำลังอัปโหลด…" : full ? "ครบจำนวนแล้ว" : "เพิ่มรูป"}
      </Button>

      {error && (
        <p role="alert" className="text-sm font-medium text-red">
          {error}
        </p>
      )}
    </div>
  )
}
