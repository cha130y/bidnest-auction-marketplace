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
      {/*
        Sellers upload whatever their camera handed them — a 16:9 car, a
        portrait of a watch — and `object-cover` filled the square frame by
        cutting the picture down to it, which crops away exactly what a bidder
        opened the picture to look at. The frame stays square so nothing on the
        page jumps as you switch between pictures of different shapes, and the
        picture is fitted inside it whole.

        Whatever the picture does not fill is filled by a blurred, over-scaled
        copy of that same picture rather than by a flat colour. It is the same
        URL, so it costs no second request, and it reads as a photograph lit
        from behind instead of a photograph that failed to fill its box. The
        over-scale is what keeps the blur's soft edge outside the frame.

        The thumbnails below keep `cover`: they are targets to press, not
        pictures to read, and a wide photo fitted into a small square would be
        a sliver.
      */}
      <div className="relative aspect-square w-full overflow-hidden rounded-r4 bg-n-100 shadow-sh1">
        {active?.url && (
          <AuctionImage
            src={active.url}
            // Decorative. The picture in front of it carries the alt text.
            alt=""
            className="absolute inset-0 size-full scale-125 object-cover blur-xl"
          />
        )}

        <AuctionImage
          src={active?.url}
          alt={title}
          // `bg-transparent` is load-bearing: AuctionImage's own `bg-n-100`
          // would otherwise paint over the blurred copy behind it.
          className="absolute inset-0 size-full bg-transparent object-contain"
        />
      </div>

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
