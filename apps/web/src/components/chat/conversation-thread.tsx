"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { listMessages, sendMessage, type ChatMessage } from "@/lib/api/chat"
import { useConversationRoom } from "@/lib/use-conversation-room"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * CHAT-002 — one thread's messages, oldest first, plus the composer.
 *
 * Fetches one page at `limit` 100 (the DTO's own max) rather than paging
 * properly: a price negotiation running past a hundred messages is not a
 * case V1 needs to handle well, and the backend orders ascending, so a
 * second page would be *older* messages, not newer ones — the wrong
 * direction to fetch automatically here.
 */
export function ConversationThread({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    listMessages(conversationId, { limit: 100 })
      .then((page) => {
        setMessages(page.items)
        setError(null)
      })
      .catch((caught: unknown) => setError(caught))
  }, [conversationId])

  useEffect(() => {
    if (ready && token) refresh()
  }, [ready, token, refresh])

  useConversationRoom(conversationId, ready ? token : null, refresh)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  if (!ready) return <Skeleton />

  if (!token) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-600">เข้าสู่ระบบเพื่อดูบทสนทนานี้</p>
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
            : "โหลดบทสนทนาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    try {
      await sendMessage(conversationId, body)
      setDraft("")
      refresh()
    } catch (caught) {
      setError(caught)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-r4 bg-white shadow-sh1">
      <div className="flex items-center gap-2 border-b border-n-200 px-5 py-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="กลับไปหน้ารายการข้อความ"
          nativeButton={false}
          render={<Link href="/chat" />}
        >
          <ArrowLeft />
        </Button>
        <span className="text-sm font-semibold text-ink">บทสนทนา</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {!messages ? (
          <p className="text-center text-sm text-n-400">กำลังโหลด…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-n-400">
            เริ่มบทสนทนาได้เลย
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.sentByMe ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-r3 px-4 py-2 text-sm whitespace-pre-line",
                  message.sentByMe
                    ? "bg-amber-500 text-ink"
                    : "bg-n-100 text-ink"
                )}
              >
                {message.body}
                <p
                  className={cn(
                    "mt-1 text-[11px]",
                    message.sentByMe ? "text-ink/60" : "text-n-500"
                  )}
                >
                  {formatDateTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => void submit(event)}
        className="flex items-center gap-2 border-t border-n-200 px-4 py-3"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="พิมพ์ข้อความ…"
          maxLength={2000}
          className="h-11 flex-1 rounded-r3 border border-n-300 bg-white px-4 text-sm text-ink outline-none focus:border-amber-500 focus:shadow-focus"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          aria-label="ส่งข้อความ"
          disabled={!draft.trim() || sending}
        >
          <Send />
        </Button>
      </form>
    </div>
  )
}

function Skeleton() {
  return (
    <div
      className="h-[70vh] rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
      aria-hidden="true"
    />
  )
}
