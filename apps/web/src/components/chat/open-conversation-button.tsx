"use client"

import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { MessagesSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"

/**
 * CHAT-001 / CHAT-004 — shared by the shop and auction "message the seller"
 * buttons: both open (or reuse) a thread and go straight to it, and until
 * this existed that whole sequence — mutate, navigate to /chat/:id, the
 * disabled state, the error line — was copied verbatim between the two.
 *
 * Auth is a prop rather than a hook call here on purpose: the shop button
 * reads it from `useCart()` (already mounted there) and the auction button
 * from `useAuthToken()` (the auction page sits outside `CartProvider`) —
 * picking one hook inside this component would force one of the two call
 * sites to depend on a provider it doesn't otherwise need.
 */
export function OpenConversationButton({
  label,
  open,
  isAuthenticated,
  authReady,
}: {
  label: string
  open: () => Promise<{ id: string }>
  isAuthenticated: boolean
  authReady: boolean
}) {
  const router = useRouter()

  const { mutate, isPending, error } = useMutation({
    mutationFn: open,
    onSuccess: (conversation) => router.push(`/chat/${conversation.id}`),
  })

  const needsLogin = authReady && !isAuthenticated

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="lg"
        block
        disabled={isPending}
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
        {label}
      </Button>

      {error instanceof ApiError && (
        <p className="text-xs text-red">{error.message}</p>
      )}
    </div>
  )
}
