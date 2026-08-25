"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { listConversations, type ConversationSummary } from "@/lib/api/chat"
import { useUserChannel } from "@/lib/use-user-channel"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * CHAT-003 — every thread the viewer is in, buying and selling combined.
 *
 * Refreshed on `useUserChannel` rather than a per-thread room: a new message
 * anywhere raises `notification:created` in the person's own room (CHAT-002 /
 * NOT-008), and this list needs to move whichever row it lands on, not the
 * one the viewer happens to have open.
 */
export function ConversationList() {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const [conversations, setConversations] = useState<
    ConversationSummary[] | null
  >(null)
  const [error, setError] = useState<unknown>(null)

  const refresh = useCallback(() => {
    listConversations()
      .then((result) => {
        setConversations(result)
        setError(null)
      })
      .catch((caught: unknown) => setError(caught))
  }, [])

  useUserChannel(ready ? token : null, refresh)

  if (!ready) return <Skeleton />

  if (!token) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-600">เข้าสู่ระบบเพื่อดูข้อความของคุณ</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          onClick={() => router.push(loginHref())}
        >
          เข้าสู่ระบบ
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!conversations) return <Skeleton />

  if (conversations.length === 0) {
    return (
      <p className="rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
        ยังไม่มีบทสนทนา — เริ่มได้จากปุ่ม “ต่อรองราคากับผู้ขาย” ในหน้าสินค้า
      </p>
    )
  }

  return (
    <ol className="overflow-hidden rounded-r4 bg-white shadow-sh1">
      {conversations.map((conversation) => {
        const unread = conversation.unreadCount > 0
        const preview = conversation.lastMessage
          ? `${conversation.lastMessage.sentByMe ? "คุณ: " : ""}${conversation.lastMessage.body}`
          : "ยังไม่มีข้อความ"

        return (
          <li
            key={conversation.id}
            className="border-b border-n-200 last:border-b-0"
          >
            <Link
              href={`/chat/${conversation.id}`}
              className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-n-100"
            >
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-r3 bg-n-100">
                {conversation.listing.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumbnail from arbitrary uploaded-image hosts, next/image would need remotePatterns for each
                  <img
                    src={conversation.listing.imageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <MessageSquare className="size-5 text-n-400" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-sm",
                      unread ? "font-semibold text-ink" : "text-n-600"
                    )}
                  >
                    {conversation.counterpart.displayName ?? "ผู้ใช้"}
                    <span className="ml-2 text-xs font-normal text-n-400">
                      {conversation.role === "BUYER" ? "คุณคือผู้ซื้อ" : "คุณคือผู้ขาย"}
                    </span>
                  </p>
                  <span className="shrink-0 text-xs text-n-500">
                    {formatDateTime(conversation.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-n-500">
                  {conversation.listing.kind === "AUCTION" && (
                    <span className="mr-1 rounded-r1 bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
                      ประมูล
                    </span>
                  )}
                  {conversation.listing.title}
                </p>
                <p
                  className={cn(
                    "mt-1 truncate text-sm",
                    unread ? "font-medium text-ink" : "text-n-500"
                  )}
                >
                  {preview}
                </p>
              </div>

              {unread && (
                <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-ink">
                  {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function Skeleton() {
  return (
    <div
      className="overflow-hidden rounded-r4 bg-white shadow-sh1"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="flex items-start gap-3 border-b border-n-200 px-5 py-4 last:border-b-0"
        >
          <div className="size-11 shrink-0 rounded-r3 bg-n-100 motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="h-3 w-4/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
