"use client"

import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { addCartItem } from "@/lib/api/cart"
import { cartErrorText } from "@/lib/cart-errors"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { SELECTION_PARAM } from "@/lib/cart-selection"
import { cn } from "@/lib/utils"

/**
 * CART-003 — buying this one listing without going through the cart screen.
 *
 * There is no second checkout path behind it. `POST /orders/checkout` prices
 * from the cart and nothing else, so this adds the line and then opens
 * `/checkout?items=<lineId>` — the partial checkout the cart's tick boxes
 * already use, with the choice made for the buyer. Whatever else is in the
 * cart is left where it is and is not paid for.
 *
 * That reuse is why this needs no API of its own, no new requirement, and no
 * second way for an order to come into being.
 *
 * One thing it inherits: `POST /cart/items` *adds to* the quantity already
 * there rather than replacing it. Press this on a listing the cart already
 * holds two of, asking for one, and the line becomes three — and three is what
 * gets paid for. Setting the quantity instead would mean silently rewriting a
 * cart the buyer filled on purpose, which is the worse of the two surprises:
 * this one is visible on the checkout screen before any money moves.
 */
export function BuyNowButton({
  productId,
  quantity = 1,
  disabled,
  className,
}: {
  productId: string
  quantity?: number
  disabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated, isAuthReady } = useCart()

  const { mutate, isPending, isSuccess, error, reset } = useMutation({
    mutationFn: () => addCartItem(productId, quantity),
    onSuccess: (cart) => {
      // The API answers with the whole cart, so the badge is right before the
      // next screen is even asked for.
      queryClient.setQueryData(cartQueryKey, cart)

      const line = cart.items.find((item) => item.product.id === productId)

      // The line is always there — it was just added. Falling back to the cart
      // rather than asserting keeps a surprise from becoming a dead button.
      router.push(
        line ? `/checkout?${SELECTION_PARAM}=${line.id}` : "/cart"
      )
    },
  })

  const needsLogin = isAuthReady && !isAuthenticated

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      {/* Stays down through `isSuccess` too. The mutation settles the moment
          the line is added, but the browser is still on its way to
          `/checkout` — a second press in that gap would add the listing to the
          cart twice. */}
      <Button
        variant="dark"
        size="lg"
        block
        disabled={disabled || isPending || isSuccess}
        onClick={() => {
          if (needsLogin) {
            router.push(loginHref())
            return
          }
          reset()
          mutate()
        }}
      >
        <Zap />
        {isPending || isSuccess ? "กำลังไปหน้าชำระเงิน…" : "ซื้อเลย"}
      </Button>
      {error !== null && (
        <p className="text-xs text-red">{cartErrorText(error)}</p>
      )}
    </div>
  )
}