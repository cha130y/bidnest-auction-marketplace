"use client"

import { createContext, use } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getCart } from "@/lib/api/cart"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import type { Cart } from "@/lib/api/types"

export const cartQueryKey = ["cart"] as const

type CartContextValue = {
  cart: Cart | undefined
  isLoading: boolean
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

  const { data, isLoading } = useQuery({
    queryKey: cartQueryKey,
    queryFn: getCart,
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  const value: CartContextValue = {
    cart: data,
    isLoading,
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
