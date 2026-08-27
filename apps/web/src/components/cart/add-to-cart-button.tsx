"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Check, ShoppingCart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { addCartItem } from "@/lib/api/cart"
import { cartErrorText } from "@/lib/cart-errors"
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
  /**
   * Offer the way to the cart once something is in it.
   *
   * Off by default because of where this button mostly lives: a catalogue
   * grid, whose rows stretch to their tallest card. A link that appeared after
   * a press would grow one card and shove its whole row down. On a detail page
   * there is no row to disturb, and the buyer who just added something is
   * exactly the one who wants it.
   */
  cartLink?: boolean
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
  cartLink,
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
      {/* The press used to end here: the label changed to "เพิ่มแล้ว" and the
          only way on was to find the cart icon in the header. */}
      {cartLink && isSuccess && (
        <Link
          href="/cart"
          className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-amber-600 underline-offset-4 hover:underline"
        >
          ไปที่ตะกร้า
          <ArrowRight className="size-4" />
        </Link>
      )}
      {error !== null && (
        <p className="text-xs text-red">{cartErrorText(error)}</p>
      )}
    </div>
  )
}
