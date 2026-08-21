import { apiFetch } from "@/lib/api/client"
import type { Cart } from "@/lib/api/types"

/**
 * CART-001 — reading the cart creates it on first call, so there is no
 * "create cart" step on the client.
 */
export function getCart() {
  return apiFetch<Cart>("/cart")
}

/** CART-001 — adding a product already in the cart adds to its quantity. */
export function addCartItem(productId: string, quantity: number) {
  return apiFetch<Cart>("/cart/items", {
    method: "POST",
    body: JSON.stringify({ productId, quantity }),
  })
}

export function updateCartItem(itemId: string, quantity: number) {
  return apiFetch<Cart>(`/cart/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  })
}

export function removeCartItem(itemId: string) {
  return apiFetch<Cart>(`/cart/items/${itemId}`, { method: "DELETE" })
}
