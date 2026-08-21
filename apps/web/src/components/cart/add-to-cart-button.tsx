"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, ShoppingCart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { addCartItem } from "@/lib/api/cart"
import { ApiError } from "@/lib/api/client"
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
  const queryClient = useQueryClient()
  const { isAuthenticated, isAuthReady } = useCart()
  // Only raised once the user actually tries — a catalog page full of red
  // "please log in" lines is noise, the button state already says enough
  const [loginHint, setLoginHint] = useState(false)

  const { mutate, isPending, isSuccess, error, reset } = useMutation({
    mutationFn: () => addCartItem(productId, quantity),
    onSuccess: (cart) => {
      // The API returns the whole cart, so seed it instead of refetching
      queryClient.setQueryData(cartQueryKey, cart)
    },
  })

  const needsLogin = isAuthReady && !isAuthenticated
  const message = loginHint
    ? "กรุณาเข้าสู่ระบบก่อนเพิ่มสินค้าลงตะกร้า"
    : error instanceof ApiError
      ? error.message
      : null

  return (
    <div className={cn("flex flex-col gap-1.5", block && "w-full", className)}>
      <Button
        variant={variant}
        size={size}
        block={block}
        disabled={disabled || isPending}
        onClick={() => {
          if (needsLogin) {
            setLoginHint(true)
            return
          }
          reset()
          mutate()
        }}
      >
        {isSuccess ? <Check /> : <ShoppingCart />}
        {isSuccess ? "เพิ่มแล้ว" : label}
      </Button>
      {message && <p className="text-xs text-red">{message}</p>}
    </div>
  )
}
