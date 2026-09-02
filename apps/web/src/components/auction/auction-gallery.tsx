"use client"

import { useState } from "react"

import { AuctionImage } from "@/components/auction/auction-image"
import { cn } from "@/lib/utils"
import type { AuctionImage as AuctionImageType } from "@/lib/api/types"

/**
 * AUC-005 — the pictures on an auction, the way the shop already shows a
 * product's.
 *
 * The detail page used to draw the primary image large and the rest underneath
 * as a plain grid. They looked like thumbnails and were not: nothing happened
 * when you pressed one, so every picture after the first was only ever visible
 * at a fifth of its size. Somebody deciding whether to bid on a used watch is
 * looking for the scratch on the back, and that is exactly the picture they
 * could not open.
 *
 * Deliberately a near-copy of `components/shop/product-gallery.tsx` rather
 * than a shared component, for the reason `auction-image.tsx` gives about the
 * two image components: lifting one into `components/ui` reaches into Dev 3's
 * imports and should be agreed rather than assumed. When a third surface needs
 * a gallery, that is the moment to have that conversation.
 */
export function AuctionGallery({
  images,
  title,
}: {
  images: AuctionImageType[]
  title: string
}) {
  // The API already sorts by `position`; the primary one just opens first.
  const initialIndex = Math.max(
    images.findIndex((image) => image.isPrimary),
    0
  )
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const active = images[activeIndex]

  return (
    <div className="flex flex-col gap-4">
      <AuctionImage
        src={active?.url}
        alt={title}
        className="aspect-square w-full rounded-r4 shadow-sh1"
      />

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-3">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`ดูรูปที่ ${index + 1}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "overflow-hidden rounded-r2 border-2 transition-colors",
                index === activeIndex
                  ? "border-amber-500"
                  : "border-transparent hover:border-n-300"
              )}
            >
              <AuctionImage
                src={image.url}
                alt={`${title} รูปที่ ${index + 1}`}
                className="aspect-square w-full"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
