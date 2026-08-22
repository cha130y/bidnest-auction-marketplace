import { AlertTriangle } from "lucide-react"

import type { SuddenDeath } from "@/lib/api/types"

const minutes = (ms: number) => Math.round(ms / 60_000)

/**
 * LIV-003 / BID-004 — the warning that the auction is inside its closing
 * window, where a bid pushes the deadline back instead of squeaking in under
 * it.
 *
 * Everything shown here is the API's own answer. `active`, the window and the
 * extension length come from the same constants the server extends by, so the
 * banner cannot promise a rule the server does not apply — and it keeps saying
 * so when `extensionsRemaining` hits 0, because the auction is still in the
 * window, it just cannot be pushed back any further. That last case is the one
 * a sniper needs to know about, so it gets its own sentence rather than
 * disappearing.
 */
export function SuddenDeathBanner({
  suddenDeath,
}: {
  suddenDeath: SuddenDeath
}) {
  if (!suddenDeath.active) return null

  const exhausted = suddenDeath.extensionsRemaining === 0

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-r3 border border-red bg-red-50 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red" />
      <div className="text-sm">
        <p className="font-semibold text-red">
          {exhausted
            ? "ช่วงท้าย — ต่อเวลาครบแล้ว"
            : `ช่วงท้าย — เสนอราคาตอนนี้จะต่อเวลาอีก ${minutes(suddenDeath.extensionMs)} นาที`}
        </p>
        <p className="mt-1 text-n-600">
          {exhausted
            ? `ต่อเวลาไปแล้ว ${suddenDeath.extensionCount} ครั้งซึ่งเป็นเพดาน การเสนอราคาหลังจากนี้จะไม่เลื่อนเวลาปิดอีก`
            : `ทุกครั้งที่มีการเสนอราคาใน ${minutes(suddenDeath.windowMs)} นาทีสุดท้าย เวลาปิดจะเลื่อนออกไป เหลือต่อเวลาได้อีก ${suddenDeath.extensionsRemaining} ครั้ง`}
        </p>
      </div>
    </div>
  )
}
