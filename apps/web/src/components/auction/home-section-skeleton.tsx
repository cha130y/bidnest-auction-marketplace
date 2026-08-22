import type { HomeSectionDefinition } from "@/components/auction/home-section-feed"

/**
 * What ships in the static shell while a card is still being read.
 *
 * The heading is real content and renders immediately; only the card below it
 * is a placeholder, and it is the same shape as the real one so the row does
 * not resize as each auction lands.
 */
export function HomeSectionSkeleton({
  definition,
}: {
  definition: HomeSectionDefinition
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink">
            {definition.label}
          </h2>
          <p className="mt-0.5 truncate text-xs text-n-500">
            {definition.description}
          </p>
        </div>
      </div>

      <div
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
    </section>
  )
}
