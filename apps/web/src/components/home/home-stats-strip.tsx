import { Gavel, Package, ShieldCheck } from "lucide-react"

/**
 * Placeholder numbers until the local DB is seeded — each label is picked to
 * be a plain `COUNT(*)` once real data is wired in (active auctions, active
 * listings, verified sellers), not a metric nothing in the app tracks yet.
 */
const STATS = [
  { icon: Gavel, value: "340+", label: "ประมูลที่กำลังดำเนินอยู่" },
  { icon: Package, value: "1,850+", label: "สินค้าที่วางขาย" },
  { icon: ShieldCheck, value: "210+", label: "ผู้ขายที่ยืนยันตัวตนแล้ว" },
]

export function HomeStatsStrip() {
  return (
    <div className="my-8 grid grid-cols-1 divide-y divide-white/10 overflow-hidden rounded-r4 bg-linear-to-b from-[#2b303b] to-ink shadow-sh2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {STATS.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex items-center gap-3 px-6 py-6">
          <Icon className="size-6 shrink-0 text-amber-400" />
          <div>
            <div className="font-display text-2xl font-extrabold text-amber-400">
              {value}
            </div>
            <div className="text-xs font-semibold text-n-300">{label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
