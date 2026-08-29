"use client"

import { Check, Truck } from "lucide-react"

import { SHIPMENT_LABELS } from "@/components/order/order-status-badge"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ShipmentTimeline } from "@/lib/api/types"

/**
 * SHIP-002 — the steps a parcel has passed, and the one it is on.
 *
 * Shared by both sides of an order: the buyer reads it, the seller reads it
 * and gets `actions` underneath. One component because the sequence and the
 * "simulated" badge have to say the same thing to both — two copies would
 * eventually disagree about what a parcel is doing.
 */
export function ShipmentPanel({
  timeline,
  isLoading,
  actions,
}: {
  timeline: ShipmentTimeline | undefined
  isLoading: boolean
  /** Rendered below the steps. The seller's controls; nothing for the buyer. */
  actions?: React.ReactNode
}) {
  if (isLoading) {
    return (
      <div
        className="h-40 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!timeline) return null

  return (
    <section className="rounded-r4 bg-white p-6 shadow-sh1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Truck className="size-5" aria-hidden="true" />
          การจัดส่ง
        </h2>
        {/* SRS 6 — while the shipment is simulated, say so rather than let it
            read as a real courier update. */}
        {timeline.isSimulated && (
          <span className="rounded-full bg-n-100 px-3 py-1 text-xs font-semibold text-n-600">
            จำลอง
          </span>
        )}
      </div>

      {timeline.trackingNumber && (
        <p className="mt-2 text-sm text-n-600">
          {timeline.carrier ?? "ขนส่ง"} ·{" "}
          <span className="font-mono text-ink">{timeline.trackingNumber}</span>
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {timeline.timeline.map((step, index) => {
          const isCurrent = index === timeline.timeline.length - 1

          return (
            <li key={`${step.status}-${step.at}`} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  isCurrent ? "bg-amber-500 text-ink" : "bg-green-50 text-green"
                )}
                aria-hidden="true"
              >
                <Check className="size-3.5" />
              </span>
              <div>
                <p
                  className={cn(
                    "font-semibold",
                    isCurrent ? "text-ink" : "text-n-600"
                  )}
                >
                  {SHIPMENT_LABELS[step.status]}
                </p>
                <p className="text-xs text-n-500">{formatDateTime(step.at)}</p>
              </div>
            </li>
          )
        })}
      </ol>

      {actions && <div className="mt-6 border-t border-n-200 pt-5">{actions}</div>}
    </section>
  )
}
