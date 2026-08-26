import { ArrowUp } from "lucide-react"

import { formatTHB } from "@/lib/format"

/**
 * Placeholder until the local DB is seeded and this reads real listings —
 * shaped like `{title, price}` on purpose so swapping in
 * `listAuctions({ section: "hot" })` results later is a one-line change.
 */
const MOCK_TICKER_ITEMS = [
  { title: "นาฬิกาข้อมือวินเทจ Seiko 5", price: "24500" },
  { title: "รองเท้าสนีกเกอร์ รุ่นลิมิเต็ด", price: "6200" },
  { title: "กล้องฟิล์มโบราณ Olympus", price: "3850" },
  { title: "โปสเตอร์หนังคลาสสิก ปี 1962", price: "2100" },
  { title: "เก้าอี้ไม้สักแบบดั้งเดิม", price: "5400" },
  { title: "หูฟังไร้สายรุ่นพิเศษ", price: "3300" },
]

function TickerItem({ title, price }: { title: string; price: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-6 text-sm font-semibold whitespace-nowrap text-n-300">
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="text-white">{title}</span>
      <span className="flex items-center gap-0.5 font-extrabold text-amber-400">
        <ArrowUp className="size-3" />
        {formatTHB(price)}
      </span>
    </div>
  )
}

/** Home page, above the hero — a "bidding is happening right now" cue. */
export function HomeLiveTicker() {
  return (
    <div className="overflow-hidden bg-ink py-2.5">
      <div className="flex w-max animate-marquee">
        {[...MOCK_TICKER_ITEMS, ...MOCK_TICKER_ITEMS].map((item, index) => (
          <TickerItem key={index} title={item.title} price={item.price} />
        ))}
      </div>
    </div>
  )
}
