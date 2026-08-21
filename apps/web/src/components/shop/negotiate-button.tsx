"use client"

import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { MessagesSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCart } from "@/components/cart/cart-provider"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { startProductConversation } from "@/lib/api/products"

/**
 * PROD-006 / CHAT-001 — opens (or reuses) the buyer↔seller thread for this
 * listing. Deliberately does not navigate: the conversation screen belongs to
 * CHAT-001..003, which the SRS marks optional and which is not built yet, so
 * linking there would land on a 404.
 *
 * The seller's `negotiationFloor` is never shown here — it stays owner-only
 * (SRS §6), the buyer just gets the thread.
 */
export function NegotiateButton({ productId }: { productId: string }) {
  const router = useRouter()
  const { isAuthenticated, isAuthReady } = useCart()

  const { mutate, isPending, isSuccess, error } = useMutation({
    mutationFn: () => startProductConversation(productId),
  })

  const needsLogin = isAuthReady && !isAuthenticated

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="lg"
        block
        disabled={isPending || isSuccess}
        onClick={() => {
          // Signed out: send them to log in and come straight back here
          if (needsLogin) {
            router.push(loginHref())
            return
          }
          mutate()
        }}
      >
        <MessagesSquare />
        {isSuccess ? "เปิดห้องต่อรองแล้ว" : "ต่อรองราคากับผู้ขาย"}
      </Button>

      {error instanceof ApiError && (
        <p className="text-xs text-red">{error.message}</p>
      )}
      {isSuccess && (
        <p className="text-xs text-n-500">
          ผู้ขายจะเห็นข้อความของคุณในกล่องแชท (หน้าห้องแชทอยู่ใน CHAT-001..003)
        </p>
      )}
    </div>
  )
}
