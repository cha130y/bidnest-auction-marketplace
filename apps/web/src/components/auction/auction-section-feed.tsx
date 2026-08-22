import { AuctionSection } from "@/components/auction/auction-section"
import { listAuctions } from "@/lib/api/auctions"
import type { AuctionSection as AuctionSectionName } from "@/lib/api/types"

export type SectionDefinition = {
  id: string
  section: AuctionSectionName
  eyebrow: string
  title: string
  description: string
  emptyMessage: string
}

/**
 * Reads one section and hands the rows to the presentational component.
 *
 * Separate from `AuctionSection` so the fetching lives in exactly one place
 * and the component that draws a section stays testable with plain arrays.
 *
 * Each feed is wrapped in its own `<Suspense>` by the page, which is what
 * keeps the four independent: they are requested in parallel, each arrives
 * when it arrives, and a slow one delays only its own grid.
 *
 * The catch is deliberate rather than an `error.tsx`. A failed section should
 * cost that section — an error boundary at the route would replace the whole
 * page, and three working sections are worth more than a single message.
 */
export async function AuctionSectionFeed({
  definition,
  limit,
}: {
  definition: SectionDefinition
  limit: number
}) {
  let auctions: Awaited<ReturnType<typeof listAuctions>>["items"] = []
  let error: unknown

  try {
    auctions = (await listAuctions({ section: definition.section, limit })).items
  } catch (caught) {
    error = caught
  }

  return (
    <AuctionSection
      id={definition.id}
      eyebrow={definition.eyebrow}
      title={definition.title}
      description={definition.description}
      auctions={auctions}
      error={error}
      emptyMessage={definition.emptyMessage}
      moreHref={`/auctions?section=${definition.section}`}
    />
  )
}
