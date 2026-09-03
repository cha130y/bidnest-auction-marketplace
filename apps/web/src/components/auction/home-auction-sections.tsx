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

/**
 * The row only ever holds as many columns as it has auctions to show, so the
 * track count is written out per case — Tailwind reads these class names at
 * build time and would not see one assembled from a number at runtime.
 */
const GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
}

/** The widest this row was drawn for, and the last key in GRID_COLUMNS. */
const MAX_COLUMNS = 4

type SectionPick = {
  section: AuctionSection
  label: string
  auction: Auction
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
 * The reads are `allSettled`: a section that is empty, or one whose read
 * fails, simply drops out of the row and the remaining columns spread to fill
 * it. An empty placeholder used to hold that spot, which was worth it while
 * the catalogue was thin; now that every section normally has something, a
 * dashed box reads as a hole rather than as information. If none of the four
 * has anything, the whole row goes away. The row is one Suspense boundary on
 * the page, so the four reads go out together.
 *
 * No auction appears twice across the row. The sections overlap by nature —
 * the one with the most watchers is very often the one closing next — and a
 * row that answered two of its four questions with the same card looked
 * broken while telling the visitor less than it could. Each column takes the
 * best auction its section has that no earlier column already took.
 */
export async function HomeAuctionSections() {
  /**
   * One candidate per column rather than one in total: the last column may
   * have to look past every earlier column's pick before it reaches one of
   * its own. Adding a fifth tab widens this on its own.
   */
  const results = await Promise.allSettled(
    AUCTION_SECTION_TABS.map((tab) =>
      listAuctions({ section: tab.value, limit: AUCTION_SECTION_TABS.length })
    )
  )

  // First come, first served, in the order the row is laid out — so the
  // section that owns an auction most strongly is the one that keeps it.
  const taken = new Set<string>()
  const picks: SectionPick[] = []

  AUCTION_SECTION_TABS.forEach((tab, index) => {
    const result = results[index]
    const items = result.status === "fulfilled" ? result.value.items : []
    const auction = items.find((item) => !taken.has(item.id))

    // Every auction this section has is already on the row: it has nothing
    // of its own left to say, so it drops out the same way an empty one does.
    if (!auction) return

    taken.add(auction.id)
    picks.push({ section: tab.value, label: tab.label, auction })
  })

  if (picks.length === 0) return null

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

      {/* Clamped rather than looked up straight: a fifth tab added to
          AUCTION_SECTION_TABS would find no entry above and put the word
          `undefined` in the class list, which drops the row to one column and
          gives nobody a reason why. Beyond four, the extra cards wrap. */}
      <div
        className={`grid gap-5 ${GRID_COLUMNS[Math.min(picks.length, MAX_COLUMNS)]}`}
      >
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

            <AuctionCard auction={pick.auction} />
          </div>
        ))}
      </div>
    </section>
  )
}
