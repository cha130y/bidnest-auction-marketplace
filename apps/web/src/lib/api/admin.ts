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
 * 🚧 ADM-005 — `GET /admin/products` itself still throws
 * `NotImplementedException` on the backend as of 2026-08-24
 * (`apps/api/src/admin/products.service.ts` — `listProducts()` is a stub;
 * only the deactivate/reactivate mutations above are real). This call will
 * 500 until Dev3 finishes it.
 *
 * The shape below is a *guess*, not a verified contract — there is no
 * response to inspect yet. It follows the query params already documented on
 * the controller (`query: cursor?, limit?, status?`) and the same
 * cursor-array pattern ADM-002/ADM-004 use, since Dev3 scaffolded this file
 * alongside those. Re-check against the real response the moment it ships;
 * do not assume this type is correct until then.
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
