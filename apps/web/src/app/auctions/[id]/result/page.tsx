import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuctionCompleteScreen } from "@/components/auction/auction-complete-screen"
import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"
import { readArena } from "@/lib/api/read-arena"

export async function generateMetadata({
  params,
}: PageProps<"/auctions/[id]/result">): Promise<Metadata> {
  const { id } = await params

  try {
    const { auction } = await readArena(id)
    return {
      title: `ผลการประมูล ${auction.title} · BidNest`,
      description: `การประมูล ${auction.title} ปิดแล้ว — ดูราคาปิดและผู้ชนะ`,
    }
  } catch {
    return { title: "ไม่พบการประมูล · BidNest" }
  }
}

/**
 * LIV-004 — how an auction ended, on a page of its own.
 *
 * Where the arena sends everybody who was watching when it closed, and a URL
 * somebody can share or come back to afterwards — which is why the result is
 * a route rather than a state the arena switches into.
 *
 * An auction that has not finished has no result to show, so this sends the
 * visitor to the arena instead of rendering an empty version of this page.
 * `redirect` rather than `notFound`: the auction is plainly there, and being
 * early is not the same as being wrong.
 */
export default async function AuctionResultPage({
  params,
}: PageProps<"/auctions/[id]/result">) {
  const { id } = await params
  const arena = await readArena(id)

  if (!arena.result) redirect(`/auctions/${id}`)

  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-250 px-4 pb-16 md:px-6">
          <AuctionCompleteScreen auctionId={id} initialArena={arena} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
