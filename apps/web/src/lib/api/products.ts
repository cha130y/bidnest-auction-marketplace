import { authHeader } from "@/lib/api/auth/token"
import { ApiError, API_BASE_URL, apiFetch, buildQuery } from "@/lib/api/client"
import type {
  OwnerProduct,
  Paginated,
  Product,
  ProductSort,
  StoredImage,
} from "@/lib/api/types"

/**
 * Posts a file and reads the answer, for the two routes that take multipart.
 *
 * `apiFetch` is not used because it sets `Content-Type: application/json`; a
 * FormData body needs the browser to set its own header with the boundary it
 * generated. The token still comes from the same place.
 *
 * A 503 means the server has no image storage configured — a deployment fact
 * rather than a mistake by whoever pressed the button, and the API says so in
 * words worth passing through.
 */
async function postImage<T>(path: string, file: File, altText?: string) {
  const form = new FormData()
  form.append("image", file)
  if (altText) form.append("altText", altText)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: authHeader(),
      body: form,
    })
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง")
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `อัปโหลดไม่สำเร็จ (${response.status})`
    throw new ApiError(response.status, message, body)
  }

  return body as T
}

/**
 * PROD-001 — files a picture before the listing it belongs to exists.
 *
 * A listing is created with its pictures already attached and has no draft to
 * hold them in the meantime, so the create form uploads first and sends the
 * urls it gets back as `imageUrls`.
 */
export function uploadPendingImage(file: File) {
  return postImage<StoredImage>("/uploads/images", file)
}

/** PROD-002 — adds a picture to a listing that already exists. */
export function addProductImage(id: string, file: File, altText?: string) {
  return postImage<OwnerProduct>(`/products/${id}/images`, file, altText)
}

/** PROD-002 — removes one picture from a listing. */
export function removeProductImage(id: string, imageId: string) {
  return apiFetch<OwnerProduct>(`/products/${id}/images/${imageId}`, {
    method: "DELETE",
  })
}

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
