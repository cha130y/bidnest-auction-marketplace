import { Gavel, KeyRound, ShieldCheck } from "lucide-react"

/**
 * The three rules of the house, under the hero.
 *
 * This strip used to carry counts — active auctions, listings, verified
 * sellers — with placeholder numbers standing in until there was real data.
 * The counts are gone rather than wired up. Two of them could be read from
 * the API today, but a marketplace that has just opened answers them with
 * single digits, and a row of them below the hero reads as "nobody is here"
 * on the page whose job is to say the opposite. The third had no answer at
 * all: nothing in the schema records a seller being verified.
 *
 * What replaces them is true on the first day and on the thousandth, and is
 * what somebody about to bid actually wants to know. Every line is a rule the
 * API enforces, and the numbers in them are the constants it enforces them
 * with — keep them in step:
 *
 *   BID-004  bid/utils/calculate-anti-sniping.util.ts (window, extension, cap)
 *   AUC-003  auction.service.ts — under the reserve settles UNSOLD
 *   AUTH-007 a code on every sign-in from a browser the account has not used
 */
const HOUSE_RULES = [
  {
    icon: Gavel,
    title: "ต่อเวลาอัตโนมัติ",
    detail: "บิดใน 2 นาทีสุดท้าย เวลายืดให้อีก 2 นาที สูงสุด 5 ครั้ง",
  },
  {
    icon: ShieldCheck,
    title: "ราคาขั้นต่ำที่ผู้ขายรับได้",
    detail: "ประมูลไม่ถึงราคาที่ผู้ขายตั้งไว้ ระบบไม่ตัดขายให้",
  },
  {
    icon: KeyRound,
    title: "ยืนยันตัวตนสองชั้น",
    detail: "เข้าสู่ระบบจากเครื่องใหม่ ต้องกรอกรหัสที่ส่งไปทางอีเมล",
  },
]

export function HomeStatsStrip() {
  return (
    <div className="my-8 grid grid-cols-1 divide-y divide-white/10 overflow-hidden rounded-r4 bg-linear-to-b from-[#2b303b] to-ink shadow-sh2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {HOUSE_RULES.map(({ icon: Icon, title, detail }) => (
        <div key={title} className="flex items-center gap-3 px-6 py-6">
          <Icon className="size-6 shrink-0 text-amber-400" />
          <div>
            <div className="font-display text-base font-extrabold text-amber-400">
              {title}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-n-300">
              {detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
