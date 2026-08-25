"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowRight } from "lucide-react"

import { SHIPMENT_LABELS } from "@/components/order/order-status-badge"
import { sellingOrdersQueryKey } from "@/components/order/selling-order-list"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { updateShipmentStatus } from "@/lib/api/orders"
import type { ShipmentStatus } from "@/lib/api/types"

/**
 * SHIP-001 — the seller moves the parcel one step at a time.
 *
 * The steps come from `nextStatuses`, which the API answers with for exactly
 * this reason ("lets the seller UI render controls without hardcoding the
 * sequence"). Nothing here knows what follows what; change the sequence on the
 * server and this follows.
 */
export function ShipmentControls({
  orderId,
  nextStatuses,
}: {
  orderId: string
  nextStatuses: ShipmentStatus[]
}) {
  const queryClient = useQueryClient()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const advance = useMutation({
    mutationFn: (status: ShipmentStatus) =>
      updateShipmentStatus(orderId, status),
    onSuccess: () => {
      setConfirmingCancel(false)
      void queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
      void queryClient.invalidateQueries({ queryKey: sellingOrdersQueryKey })
    },
    onError: (error) => {
      // A 409 means this tab was reading a stale status. Re-reading is the
      // whole fix, and doing it here is what makes the message below true.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
      }
    },
  })

  /**
   * `CANCELLED` is deliberately not treated as just another step.
   *
   * From PROCESSING the API offers `['SHIPPED', 'CANCELLED']`, and rendering
   * both as identical buttons side by side is how a seller cancels an order by
   * mistake — which restocks the goods and closes the order for good, with no
   * way back. So the forward step is the button, and cancelling is a separate,
   * destructive action that asks first.
   */
  const forward = nextStatuses.filter((status) => status !== "CANCELLED")
  const canCancel = nextStatuses.includes("CANCELLED")

  // The service guards its update on the status it just read, so two tabs
  // racing produce a 409 rather than a double advance. Refetching is the
  // honest response: the parcel really did move, just not because of this tab.
  const isConflict = advance.error instanceof ApiError && advance.error.status === 409

  if (forward.length === 0 && !canCancel) {
    return (
      <p className="text-sm text-n-600">
        คำสั่งซื้อนี้จบแล้ว ไม่มีขั้นตอนให้ดำเนินการต่อ
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {forward.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">ขั้นตอนถัดไป</p>
          <div className="flex flex-wrap gap-2">
            {forward.map((status) => (
              <Button
                key={status}
                variant="primary"
                size="md"
                disabled={advance.isPending}
                onClick={() => advance.mutate(status)}
              >
                {advance.isPending ? "กำลังอัปเดต…" : SHIPMENT_LABELS[status]}
                <ArrowRight />
              </Button>
            ))}
          </div>
          <p className="text-xs text-n-500">
            ผู้ซื้อจะเห็นสถานะใหม่ทันทีที่คุณกด และได้รับแจ้งเตือน
          </p>
        </div>
      )}

      {canCancel && (
        <div className="rounded-r3 border border-red bg-red-50 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-red">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ยกเลิกการจัดส่ง
          </p>
          <p className="mt-1 text-xs text-n-600">
            คำสั่งซื้อจะถูกยกเลิกถาวร สินค้าจะถูกคืนเข้าสต็อก
            และย้อนกลับไม่ได้อีก
          </p>

          {confirmingCancel ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={advance.isPending}
                onClick={() => advance.mutate("CANCELLED")}
              >
                {advance.isPending ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={advance.isPending}
                onClick={() => setConfirmingCancel(false)}
              >
                ไม่ใช่ กลับไปก่อน
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              disabled={advance.isPending}
              onClick={() => setConfirmingCancel(true)}
            >
              ยกเลิกการจัดส่ง
            </Button>
          )}
        </div>
      )}

      {advance.error && (
        <p
          role="alert"
          className="rounded-r3 bg-red-50 px-3 py-2 text-sm font-medium text-red"
        >
          {isConflict
            ? "สถานะเปลี่ยนไปแล้วจากที่อื่น — หน้านี้อ่านค่าล่าสุดให้แล้ว ลองอีกครั้ง"
            : advance.error instanceof ApiError
              ? advance.error.message
              : "อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      )}
    </div>
  )
}
