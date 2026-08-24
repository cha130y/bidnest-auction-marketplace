/**
 * Placeholder for a row of `AuctionCard`/`ProductCard` — same shape as both
 * (square image + a few text lines), so whichever one lands does not resize
 * the row.
 */
export function CardGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-r4 bg-white shadow-sh1"
          aria-hidden="true"
        >
          <div className="aspect-square w-full bg-n-100 motion-safe:animate-pulse" />
          <div className="flex flex-col gap-2 p-4">
            <div className="h-3 w-1/3 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="h-4 w-4/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="h-3 w-1/2 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="mt-3 h-5 w-2/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
