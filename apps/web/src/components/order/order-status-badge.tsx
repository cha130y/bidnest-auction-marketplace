import { Badge } from "@/components/ui/badge"
import type { OrderStatus, ShipmentStatus } from "@/lib/api/types"

const ORDER_LABELS: Record<OrderStatus, string> = {
  PENDING: "รอชำระเงิน",
  PAID: "ชำระเงินแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
}

/** SHIP-002 — the buyer-facing name of each step the parcel passes through. */
const SHIPMENT_LABELS: Record<ShipmentStatus, string> = {
  PROCESSING: "กำลังเตรียมพัสดุ",
  SHIPPED: "ส่งออกแล้ว",
  IN_TRANSIT: "อยู่ระหว่างขนส่ง",
  DELIVERED: "จัดส่งสำเร็จ",
  CANCELLED: "ยกเลิกการจัดส่ง",
}

/** Green for paid, amber while it waits, grey once it is over. */
const ORDER_VARIANTS = {
  PENDING: "ending",
  PAID: "won",
  CANCELLED: "sold",
} as const

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER_VARIANTS[status]}>{ORDER_LABELS[status]}</Badge>
}

export function ShipmentStatusLabel({ status }: { status: ShipmentStatus }) {
  return <>{SHIPMENT_LABELS[status]}</>
}

export { ORDER_LABELS, SHIPMENT_LABELS }