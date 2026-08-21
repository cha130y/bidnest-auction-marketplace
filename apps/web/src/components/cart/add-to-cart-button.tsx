"use client"

import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, ShoppingCart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { addCartItem } from "@/lib/api/cart"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { cn } from "@/lib/utils"

type AddToCartButtonProps = {
  productId: string
  quantity?: number
  disabled?: boolean
  label?: string
  size?: "sm" | "md" | "lg"
  variant?: "primary" | "dark" | "secondary"
  block?: boolean
  className?: string
}

/**
 * CART-001 — the smallest client island that can add to the cart, so catalog
 * and detail pages stay Server Components. Settles by invalidating the shared
 * cart query, which is what moves the header badge.
 */
export function AddToCartButton({
  productId,
  quantity = 1,
  disabled,
  label = "เพิ่มลงตะกร้า",
  size = "sm",
  variant = "primary",
  block,
  className,
}: AddToCartButtonProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated, isAuthReady } = useCart()

  const { mutate, isPending, isSuccess, error, reset } = useMutation({
    mutationFn: () => addCartItem(productId, quantity),
    onSuccess: (cart) => {
      // The API returns the whole cart, so seed it instead of refetching
      queryClient.setQueryData(cartQueryKey, cart)
    },
  })

  const needsLogin = isAuthReady && !isAuthenticated

  return (
    <div className={cn("flex flex-col gap-1.5", block && "w-full", className)}>
      <Button
        variant={variant}
        size={size}
        block={block}
        disabled={disabled || isPending}
        onClick={() => {
          // Signed out: send them to log in and come straight back here
          if (needsLogin) {
            router.push(loginHref())
            return
          }
          reset()
          mutate()
        }}
      >
        {isSuccess ? <Check /> : <ShoppingCart />}
        {isSuccess ? "เพิ่มแล้ว" : label}
      </Button>
      {error instanceof ApiError && (
        <p className="text-xs text-red">{error.message}</p>
      )}
    </div>
  )
}
