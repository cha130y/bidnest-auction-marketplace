import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  CheckoutResult,
  Order,
  OrderStatus,
  Paginated,
  PaymentMethod,
  ShipmentStatus,
  ShipmentTimeline,
  ShippingAddress,
} from "@/lib/api/types"

export type ListOrdersParams = {
  status?: OrderStatus
  page?: number
  limit?: number
}

/** SHIP-003 — orders I bought. */
export function listOrders(params: ListOrdersParams = {}) {
  return apiFetch<Paginated<Order>>(`/orders${buildQuery({ ...params })}`)
}

/** SHIP-003 — orders I sold. */
export function listSellingOrders(params: ListOrdersParams = {}) {
  return apiFetch<Paginated<Order>>(
    `/orders/selling${buildQuery({ ...params })}`
  )
}

export function getOrder(id: string) {
  return apiFetch<Order>(`/orders/${id}`)
}

export type CheckoutInput = {
  paymentMethod: PaymentMethod
  shippingAddress: Omit<ShippingAddress, "line2"> & { line2?: string }
  /**
   * CART-003 — the cart lines this payment covers. Omit it to pay for the
   * whole cart, which is what the route did before selection existed.
   */
  cartItemIds?: string[]
}

/**
 * CART-004/005 — one payment per checkout session, then one order per seller.
 * Payment is simulated server-side; no real gateway is contacted (SRS 1.2).
 */
export function checkout(input: CheckoutInput) {
  return apiFetch<CheckoutResult>("/orders/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** SHIP-002 — buyer-facing timeline plus the seller's allowed next steps. */
export function getShipment(orderId: string) {
  return apiFetch<ShipmentTimeline>(`/orders/${orderId}/shipment`)
}

/** SHIP-001 — seller only, one forward step at a time. */
export function updateShipmentStatus(orderId: string, status: ShipmentStatus) {
  return apiFetch<ShipmentTimeline>(`/orders/${orderId}/shipment`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}
