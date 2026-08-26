import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  Auction,
  Category,
  CategoryTree,
  OrderStatus,
  Paginated,
  ProductStatus,
  ShipmentStatus,
} from "@/lib/api/types"

/**
 * The `AuctionStatus` exported from `types.ts` only has the 4 values a public
 * catalogue card can be in (`SCHEDULED | ACTIVE | SOLD | UNSOLD`) — it never
 * had to describe DRAFT (not yet published) or CANCELLED (ADM-001's own
 * outcome), so it can't be reused here. Admin oversight lists every status
 * the schema.prisma `AuctionStatus` enum has.
 */
export type AdminAuctionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "SOLD"
  | "UNSOLD"
  | "CANCELLED"

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
    role?: AdminUserRow["role"]
  } = {}
): Promise<AdminUserRow[]> {
  return apiFetch<AdminUserRow[]>(`/admin/users${buildQuery(params)}`)
}

/**
 * An admin's own password — mirrors AUTH-005's own reset: every other
 * session and trusted device is revoked on success, so this account will be
 * asked to sign in again everywhere else.
 */
export function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  return apiFetch<void>("/admin/users/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  })
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
  return apiFetch<AdminUserRow>(`/admin/users/${userId}/reactivate`, {
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

/**
 * ADM-005 — `GET /admin/products` was a stub (`NotImplementedException`)
 * until 2026-08-26, filled in by Dev 5 since it was blocking this table —
 * see `apps/api/src/admin/products.service.ts`. Verified against the real
 * response; this shape is no longer a guess.
 */
export type AdminProductRow = {
  id: string
  title: string
  status: ProductStatus
  stockQty: number
  seller: { id: string; email: string; displayName: string | null }
}

export function fetchAdminProducts(
  params: { cursor?: string; limit?: number; status?: ProductStatus } = {}
): Promise<AdminProductRow[]> {
  return apiFetch<AdminProductRow[]>(`/admin/products${buildQuery(params)}`)
}

// ── Dashboard overview — real counts, across every admin module ────────────

export type AdminOverview = {
  users: { total: number; suspended: number }
  auctions: { active: number; total: number }
  products: { active: number; total: number }
  orders: { paidCount: number; paidTotal: string }
  adminActionsLast24h: number
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/admin/overview")
}

// ── ADM-001 — auction oversight (owner: Dev 4) ──────────────────────────────

export function fetchAdminAuctions(
  params: { status?: AdminAuctionStatus; page?: number; limit?: number } = {}
) {
  return apiFetch<Paginated<Auction>>(`/admin/auctions${buildQuery(params)}`)
}

/** ADM-001 — reason is required, unlike a seller's own AUC-006 cancellation. */
export function cancelAdminAuction(auctionId: string, reason: string) {
  return apiFetch<Auction>(`/admin/auctions/${auctionId}/cancel`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  })
}

// ── ADM-003 — category management (owner: Dev 2) ────────────────────────────
// Lives under /categories, not /admin, because GET /categories is public
// (PROD-003/AUC-001 both read it) — see categories.controller.ts.

export function fetchAdminCategoryTree(): Promise<CategoryTree[]> {
  return apiFetch<CategoryTree[]>(`/categories/admin`)
}

export function createCategory(input: {
  name: string
  description?: string
  parentId?: string
}): Promise<Category> {
  return apiFetch<Category>(`/categories`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateCategory(
  categoryId: string,
  input: { name?: string; description?: string }
): Promise<Category> {
  return apiFetch<Category>(`/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function activateCategory(categoryId: string): Promise<Category> {
  return apiFetch<Category>(`/categories/${categoryId}/activate`, {
    method: "PATCH",
  })
}

export function deactivateCategory(categoryId: string): Promise<Category> {
  return apiFetch<Category>(`/categories/${categoryId}/deactivate`, {
    method: "PATCH",
  })
}
