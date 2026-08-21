import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  OrderStatus,
  Paginated,
  ProductStatus,
  ShipmentStatus,
} from "@/lib/api/types"

/**
 * ADM-006 — deliberately narrower than `Order`: SRS §6 forbids returning the
 * shipping address or the buyer/seller conversation to an admin, so the API
 * sends summary fields only.
 */
export type AdminOrderSummary = {
  id: string
  checkoutSessionId: string
  status: OrderStatus
  subtotal: string
  itemCount: number
  shipmentStatus: ShipmentStatus | null
  createdAt: string
  buyer: { id: string; email: string; displayName: string | null }
  seller: { id: string; email: string; displayName: string | null }
}

export function listAdminOrders(
  params: { status?: OrderStatus; page?: number; limit?: number } = {}
) {
  return apiFetch<Paginated<AdminOrderSummary>>(
    `/admin/orders${buildQuery({ ...params })}`
  )
}

/** Returned by both moderation endpoints. */
export type ModeratedProduct = {
  id: string
  title: string
  status: ProductStatus
  stockQty: number
  reason: string
}

/** ADM-005 — takedown; `reason` is required and lands in the audit log. */
export function deactivateAdminProduct(productId: string, reason: string) {
  return apiFetch<ModeratedProduct>(`/admin/products/${productId}/deactivate`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  })
}

/** ADM-005 — restore; only a SUSPENDED listing can be reactivated. */
export function reactivateAdminProduct(productId: string, reason: string) {
  return apiFetch<ModeratedProduct>(`/admin/products/${productId}/reactivate`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  })
}
