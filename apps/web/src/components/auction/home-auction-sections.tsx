import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { AuctionCard } from "@/components/auction/auction-card"
import { listAuctions } from "@/lib/api/auctions"
import { AUCTION_SECTION_TABS } from "@/lib/auction-search"
import type { Auction, AuctionSection } from "@/lib/api/types"

/**
 * What each section is worth looking at for, under its own name. The names
 * themselves come from `AUCTION_SECTION_TABS`, so this row and the tab strip
 * on `/auctions` cannot drift apart — one line each, because a column this
 * narrow has room for a label and not much else.
 */
const SECTION_HINT: Record<AuctionSection, string> = {
  hot: "คนสนใจมากที่สุด",
  "ending-soon": "ใกล้หมดเวลา",
  "starting-soon": "ยังไม่เปิด",
  "recently-ended": "เพิ่งปิดไป",
}

type SectionPick = {
  section: AuctionSection
  label: string
  auction: Auction | null
}

/**
 * AUC-008 — the four sections on the home page, one auction each.
 *
 * Replaces the five-across "ปิดเร็วๆ นี้" row. That row answered one question
 * well and hid the other three: somebody landing here could not tell there was
 * anything scheduled, or that an auction had just been won. Four columns say
 * what the site is doing right now in one glance, and each one is a way in to
 * the full section.
 *
 * One row rather than four stacked ones on purpose — `/auctions` already has
 * the tab strip for reading a section properly, so repeating all of it here
 * would push the products below the fold for no gain.
 *
 * The reads are `allSettled` and one auction deep: a section that is empty, or
 * one whose read fails, costs its own column and nothing else. The whole row
 * is one Suspense boundary on the page, so the four go out together.
 */
export async function HomeAuctionSections() {
  const results = await Promise.allSettled(
    AUCTION_SECTION_TABS.map((tab) =>
      listAuctions({ section: tab.value, limit: 1 })
    )
  )

  const picks: SectionPick[] = AUCTION_SECTION_TABS.map((tab, index) => {
    const result = results[index]

    return {
      section: tab.value,
      label: tab.label,
      auction:
        result.status === "fulfilled" ? (result.value.items[0] ?? null) : null,
    }
  })

  return (
    <section className="py-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">
            ประมูลตอนนี้
          </h2>
          <p className="mt-1 text-sm text-n-500">
            ยอดนิยม ปิดเร็วๆ นี้ กำลังจะเริ่ม และผลล่าสุด
          </p>
        </div>
        <Link
          href="/auctions"
          className="shrink-0 text-sm font-semibold text-amber-600 transition-colors hover:text-ink"
        >
          ดูทั้งหมด
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {picks.map((pick) => (
          <div key={pick.section} className="flex flex-col gap-2">
            {/* The label is the link: the card underneath already goes to its
                own auction, so the only thing left to click through to is the
                rest of the section. */}
            <Link
              href={`/auctions?section=${pick.section}`}
              className="group flex items-baseline justify-between gap-2"
            >
              <span className="font-display text-sm font-bold text-ink transition-colors group-hover:text-amber-600">
                {pick.label}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-n-500 transition-colors group-hover:text-amber-600">
                {SECTION_HINT[pick.section]}
                <ArrowRight className="size-3" aria-hidden="true" />
              </span>
            </Link>

            {pick.auction ? (
              <AuctionCard auction={pick.auction} />
            ) : (
              <EmptyColumn section={pick.section} />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * A section with nothing in it, which is a normal state rather than a fault —
 * nothing is scheduled, or nothing has ended yet. Kept the same height as a
 * card so one empty column does not pull the row out of line, and still
 * clickable, because the section is where you would go to check.
 *
 * A failed read lands here too. The row deliberately does not distinguish the
 * two: an empty section and one that could not be read look the same to
 * somebody who just wants to see what is on, and the difference is not theirs
 * to act on.
 */
function EmptyColumn({ section }: { section: AuctionSection }) {
  return (
    <Link
      href={`/auctions?section=${section}`}
      className="flex flex-1 items-center justify-center rounded-r4 border border-dashed border-n-300 bg-white/50 px-4 py-16 text-center text-sm text-n-500 transition-colors hover:border-amber-400 hover:text-amber-600"
    >
      ยังไม่มีรายการ
    </Link>
  )
}
