import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Sellers supply image URLs from any host (`@IsUrl()` in CreateProductDto has
 * no allowlist), so `next/image` is not usable here — its `remotePatterns`
 * would have to be opened to every host on the internet to match, which turns
 * the optimizer into an open proxy. A plain `<img>` is the safer trade.
 */
export function ProductImage({
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
