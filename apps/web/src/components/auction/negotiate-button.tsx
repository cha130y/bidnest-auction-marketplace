"use client"

import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { MessagesSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { startAuctionConversation } from "@/lib/api/chat"

/**
 * CHAT-004 — the auction-side counterpart to shop's NegotiateButton. Opens
 * (or reuses) the thread with the seller and goes straight to it.
 *
 * `useAuthToken()` rather than `useCart()`: this renders on /auctions/[id],
 * which sits outside the (shop) layout's `CartProvider`.
 */
export function AuctionNegotiateButton({ auctionId }: { auctionId: string }) {
  const router = useRouter()
  const { token, ready } = useAuthToken()

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => startAuctionConversation(auctionId),
    onSuccess: (conversation) => router.push(`/chat/${conversation.id}`),
  })

  const needsLogin = ready && !token

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="lg"
        block
        disabled={isPending}
        onClick={() => {
          if (needsLogin) {
            router.push(loginHref())
            return
          }
          mutate()
        }}
      >
        <MessagesSquare />
        ทักผู้ขาย
      </Button>

      {error instanceof ApiError && (
        <p className="text-xs text-red">{error.message}</p>
      )}
    </div>
  )
}
