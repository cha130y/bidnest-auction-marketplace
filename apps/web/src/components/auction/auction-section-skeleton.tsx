import type { SectionDefinition } from "@/components/auction/auction-section-feed"

/**
 * What ships in the static shell while a section is still being read.
 *
 * Deliberately the same heading and the same grid shape as the real section,
 * so the only thing that changes when the rows arrive is the cards themselves
 * — a fallback of a different height would move the three sections below it
 * down the page as each one lands.
 *
 * A placeholder rather than a spinner: the headings are real content and are
 * worth showing immediately, and there is nothing to wait for above them.
 */
export function AuctionSectionSkeleton({
  definition,
  count,
}: {
  definition: SectionDefinition
  count: number
}) {
  return (
    <section id={definition.id} className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-600 uppercase">
            {definition.eyebrow}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
            {definition.title}
          </h2>
          <p className="mt-1 text-sm text-n-600">{definition.description}</p>
        </div>
      </div>

      <div
        className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-r4 bg-white shadow-sh1"
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
    </section>
  )
}
