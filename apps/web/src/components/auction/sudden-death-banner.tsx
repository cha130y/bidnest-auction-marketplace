import { AlertTriangle } from "lucide-react"

import { formatDateTime, formatTHB } from "@/lib/format"
import { describeUrgency } from "@/lib/auction-urgency"
import type { SuddenDeath } from "@/lib/api/types"

const minutes = (ms: number) => Math.round(ms / 60_000)

/**
 * LIV-003 / BID-004 — the two urgent states, which say different things.
 *
 * `closing` is "there is very little time left". `suddenDeath` is "bidding now
 * moves the deadline rather than racing it" — a different instruction, so it
 * gets a different panel rather than a louder version of the same one.
 *
 * Everything shown is the API's own answer: the window, the extension length,
 * how many are left, and the extension that last moved the deadline. The
 * banner cannot promise a rule the server does not apply.
 */
export function SuddenDeathBanner({
  suddenDeath,
}: {
  suddenDeath: SuddenDeath
}) {
  const urgency = describeUrgency(suddenDeath)

  if (urgency === "calm") return null

  if (urgency === "closing") {
    return (
      <section
        role="status"
        className="rounded-r3 bg-amber-50 px-4 py-3 ring-1 ring-amber-200"
      >
        <p className="text-[11px] font-bold tracking-[0.18em] text-amber-600 uppercase">
          ใกล้ปิด
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-ink">
          เหลือเวลาไม่ถึง {minutes(suddenDeath.windowMs)} นาที
        </h2>
        <p className="mt-1 text-sm text-n-600">
          เสนอราคาได้เลย — การเสนอราคาช่วงนี้จะทำให้เวลาปิดเลื่อนออกไป
        </p>
      </section>
    )
  }

  const exhausted = suddenDeath.extensionsRemaining === 0
  const { lastExtension } = suddenDeath

  return (
    <div className="flex flex-col gap-2">
      {/* The one-line rule, above the panel, the way cbeave puts it: it is the
          thing somebody needs before they read anything else. */}
      <p className="flex items-center gap-2 rounded-r2 bg-red-50 px-3 py-2 text-xs font-semibold text-red ring-1 ring-red/30">
        <AlertTriangle className="size-3.5 shrink-0" />
        คำเตือน — ทุกการเสนอราคาที่ผ่านเกณฑ์จะรีเซ็ตเวลานับถอยหลัง
      </p>

      <section
        role="status"
        // LIV-005 — the panel breathes while the deadline is live. `pulse-urgent`
        // is defined next to this component rather than in the design system;
        // see `arena-panel.tsx` for why.
        className="rounded-r3 bg-red-50 px-4 py-4 ring-1 ring-red motion-safe:animate-[pulse-urgent_1.5s_ease-in-out_infinite]"
      >
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-red uppercase">
          <span className="size-1.5 rounded-full bg-red" />
          ช่วงต่อเวลา
          {lastExtension && ` · ครั้งที่ ${lastExtension.extensionNumber}`}
        </p>

        <h2 className="mt-1.5 font-display text-lg font-bold text-ink">
          {exhausted
            ? "ต่อเวลาครบแล้ว ปิดตามเวลานี้แน่นอน"
            : "การเสนอราคาจะเลื่อนเวลาปิดออกไป"}
        </h2>

        <p className="mt-1 text-sm text-n-600">
          {exhausted
            ? `ต่อเวลาไปแล้ว ${suddenDeath.extensionCount} ครั้งซึ่งเป็นเพดาน การเสนอราคาหลังจากนี้จะไม่เลื่อนเวลาปิดอีก`
            : `ทุกครั้งที่มีการเสนอราคา เวลาปิดจะเลื่อนออกไปอีก ${minutes(suddenDeath.extensionMs)} นาที เหลือต่อเวลาได้อีก ${suddenDeath.extensionsRemaining} ครั้ง`}
        </p>

        {lastExtension && (
          // What actually happened, in the two numbers that make it checkable:
          // this amount moved it to that time.
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-r2 bg-white px-3 py-2 ring-1 ring-red/20">
              <dt className="text-[10px] font-bold tracking-[0.14em] text-n-500 uppercase">
                ราคาที่ทำให้ต่อเวลา
              </dt>
              <dd className="mt-0.5 font-display text-sm font-bold text-ink tabular-nums">
                {formatTHB(lastExtension.triggeringBid)}
              </dd>
            </div>
            <div className="rounded-r2 bg-white px-3 py-2 ring-1 ring-red/20">
              <dt className="text-[10px] font-bold tracking-[0.14em] text-n-500 uppercase">
                เวลาปิดใหม่
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink">
                {formatDateTime(lastExtension.newEndAt)}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  )
}
