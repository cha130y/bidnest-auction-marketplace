"use client"

import { createContext, use } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getCart } from "@/lib/api/cart"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import type { Cart } from "@/lib/api/types"

export const cartQueryKey = ["cart"] as const

type CartContextValue = {
  cart: Cart | undefined
  /**
   * No cart yet, and no answer that there never will be one.
   *
   * `isPending`, not `isLoading`. React Query's `isLoading` is
   * `isPending && isFetching`, so it is *false* on the render where the query
   * has only just been enabled — the token has arrived but the request has not
   * left yet. A screen that gates on `isLoading` falls through on exactly that
   * render, sees `cart === undefined`, and flashes "your cart is empty" at
   * somebody whose cart is about to arrive full.
   *
   * `isPending` covers that gap and still goes false on error, so a cart that
   * cannot be read never leaves a screen waiting forever.
   */
  isPending: boolean
  /** The read failed — a 401 or an unreachable API, not an empty cart. */
  isError: boolean
  /** False while `ready` is false too — check `isAuthReady` before acting on it. */
  isAuthenticated: boolean
  isAuthReady: boolean
  itemCount: number
  refreshCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

/**
 * Holds the one shared read of `GET /cart` so the header badge and the cart
 * page never disagree. Mutations live in the components that trigger them and
 * settle by invalidating `cartQueryKey`.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuthToken()
  const queryClient = useQueryClient()
  const isAuthenticated = ready && Boolean(token)

  const { data, isPending, isError } = useQuery({
    queryKey: cartQueryKey,
    queryFn: getCart,
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  const value: CartContextValue = {
    cart: data,
    isPending,
    isError,
    isAuthenticated,
    isAuthReady: ready,
    itemCount: data?.summary.itemCount ?? 0,
    refreshCart: () => {
      void queryClient.invalidateQueries({ queryKey: cartQueryKey })
    },
  }

  return <CartContext value={value}>{children}</CartContext>
}

export function useCart(): CartContextValue {
  const context = use(CartContext)
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>")
  }
  return context
}
