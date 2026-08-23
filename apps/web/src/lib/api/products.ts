import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  OwnerProduct,
  Paginated,
  Product,
  ProductSort,
} from "@/lib/api/types"

/** Mirrors SearchProductDto in apps/api/src/product/dtos/search-product.dto.ts */
export type ProductSearchParams = {
  q?: string
  categoryIds?: string[]
  minPrice?: number
  maxPrice?: number
  sort?: ProductSort
  page?: number
  limit?: number
}

/** PROD-003/004 — public catalog, ACTIVE listings only. */
export function searchProducts(params: ProductSearchParams = {}) {
  return apiFetch<Paginated<Product>>(`/products${buildQuery({ ...params })}`)
}

/**
 * `@Public()`, but the seller gets `negotiationFloor` back when the request
 * carries their token — hence the owner type. Buyer UI must ignore that field.
 */
export function getProduct(id: string) {
  return apiFetch<OwnerProduct>(`/products/${id}`)
}

/** Mirrors CreateProductDto — PROD-001 requires at least one image URL. */
export type CreateProductInput = {
  title: string
  description: string
  categoryId: string
  price: number
  stockQty: number
  condition: "NEW" | "USED"
  imageUrls: string[]
  negotiationFloor?: number
  quantityDiscountMinQty?: number
  quantityDiscountPercent?: number
}

export function createProduct(input: CreateProductInput) {
  return apiFetch<OwnerProduct>("/products", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateProduct(
  id: string,
  input: Partial<CreateProductInput>
) {
  return apiFetch<OwnerProduct>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

/** PROD-002 — the seller may only toggle between ACTIVE and INACTIVE. */
export function updateProductStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  return apiFetch<OwnerProduct>(`/products/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}

/** PROD-005 — stock drives OUT_OF_STOCK, the API derives the status itself. */
export function updateProductStock(id: string, stockQty: number) {
  return apiFetch<OwnerProduct>(`/products/${id}/stock`, {
    method: "PATCH",
    body: JSON.stringify({ stockQty }),
  })
}

export function deleteProduct(id: string) {
  return apiFetch<void>(`/products/${id}`, { method: "DELETE" })
}

/** PROD-006 — opens (or reuses) the negotiation thread with the seller. */
export function startProductConversation(productId: string) {
  return apiFetch<{ id: string }>(`/products/${productId}/conversations`, {
    method: "POST",
  })
}
