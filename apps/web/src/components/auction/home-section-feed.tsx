import { HomeSectionCard } from "@/components/auction/home-section-card"
import { listAuctions } from "@/lib/api/auctions"
import type { AuctionSection as AuctionSectionName } from "@/lib/api/types"

export type HomeSectionDefinition = {
  id: string
  section: AuctionSectionName
  label: string
  description: string
  emptyMessage: string
}

/**
 * Reads the top of one section and hands it to the card.
 *
 * Asks for one row, because one is what the card shows. The section's ordering
 * on the server already decides which auction that is; taking the first of a
 * larger page would be the same answer with more of it thrown away.
 *
 * The catch is deliberate rather than an `error.tsx`: a failed section should
 * cost that card, and three working ones are worth more than a single message
 * where the whole row was.
 */
export async function HomeSectionFeed({
  definition,
}: {
  definition: HomeSectionDefinition
}) {
  let auction: Awaited<ReturnType<typeof listAuctions>>["items"][number] | null =
    null
  let error: unknown

  try {
    const page = await listAuctions({ section: definition.section, limit: 1 })
    auction = page.items[0] ?? null
  } catch (caught) {
    error = caught
  }

  return (
    <HomeSectionCard
      label={definition.label}
      description={definition.description}
      auction={auction}
      error={error}
      emptyMessage={definition.emptyMessage}
      moreHref={`/auctions?section=${definition.section}`}
    />
  )
}
