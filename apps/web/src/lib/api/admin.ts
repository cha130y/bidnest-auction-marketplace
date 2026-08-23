import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  OrderStatus,
  Paginated,
  ProductStatus,
  ShipmentStatus,
} from "@/lib/api/types"

export interface CurrentUser {
  id: string
  email: string
  role: "USER" | "ADMIN"
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/users/me")
}

// ── ADM-002 — user management ────────────────────────────────────────────

export interface AdminUserRow {
  id: string
  email: string
  role: "USER" | "ADMIN"
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
  createdAt: string
}

export function fetchUsers(
  params: {
    cursor?: string
    limit?: number
    status?: AdminUserRow["status"]
  } = {}
): Promise<AdminUserRow[]> {
  return apiFetch<AdminUserRow[]>(`/admin/users${buildQuery(params)}`)
}

export function suspendUser(
  userId: string,
  note?: string
): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/admin/users/${userId}/suspend`, {
    method: "PATCH",
    body: JSON.stringify(note ? { note } : {}),
  })
}

export function reactivateUser(
  userId: string,
  note?: string
): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/admin/users/${userId}/reactive`, {
    method: "PATCH",
    body: JSON.stringify(note ? { note } : {}),
  })
}

// ── ADM-004 — audit log (cursor-based: admin_actions has a composite index,
// not an offset-friendly one — see dev5-backend-plan.csv Phase 4) ──────────

export interface AuditLogItem {
  id: string
  adminUserId: string
  targetUserId: string | null
  auctionId: string | null
  categoryId: string | null
  productId: string | null
  actionType: string
  note: string | null
  createdAt: string
}

export function fetchAuditLogs(
  params: {
    cursor?: string
    limit?: number
    actionType?: string
  } = {}
): Promise<AuditLogItem[]> {
  return apiFetch<AuditLogItem[]>(`/admin/actions${buildQuery(params)}`)
}

// ── ADM-006 — order moderation (owner: Dev 3) ───────────────────────────────

/**
 * Deliberately narrower than `Order`: SRS §6 forbids returning the shipping
 * address or the buyer/seller conversation to an admin, so the API sends
 * summary fields only.
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

// ── ADM-005 — product moderation (owner: Dev 3) ─────────────────────────────

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
