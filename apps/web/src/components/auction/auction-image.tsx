import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Sellers supply image URLs from any host — `CreateAuctionDraftDto` validates
 * `imageUrls` with `@IsUrl({}, { each: true })` and no allowlist — so
 * `next/image` is not usable here: its `remotePatterns` would have to be opened
 * to every host on the internet to match, which turns the optimizer into an
 * open proxy. A plain `<img>` is the safer trade.
 *
 * This is deliberately the same trade `components/shop/product-image.tsx`
 * makes, for the same reason, and the two are near-identical. They are kept
 * apart rather than shared so neither module reaches into the other's folder;
 * if a third surface needs one, that is the moment to lift a single component
 * into `components/ui` — a change that touches Dev 3's imports and should be
 * agreed rather than assumed.
 */
export function AuctionImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt: string
  className?: string
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-n-100 text-n-400",
          className
        )}
      >
        <ImageOff className="size-8" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn("bg-n-100 object-cover", className)}
    />
  )
}
