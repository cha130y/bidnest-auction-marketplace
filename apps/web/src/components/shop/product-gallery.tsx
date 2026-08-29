"use client"

import { useState } from "react"

import { ProductImage } from "@/components/shop/product-image"
import { cn } from "@/lib/utils"
import type { ProductImage as ProductImageType } from "@/lib/api/types"

export function ProductGallery({
  images,
  title,
}: {
  images: ProductImageType[]
  title: string
}) {
  // The API already sorts by `position`; the primary one just opens first
  const initialIndex = Math.max(
    images.findIndex((image) => image.isPrimary),
    0
  )
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const active = images[activeIndex]

  return (
    <div className="flex flex-col gap-4">
      <ProductImage
        src={active?.url}
        alt={title}
        className="aspect-square w-full rounded-r4 shadow-sh1"
      />

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-3">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
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
              <ProductImage
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
