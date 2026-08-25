"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"

import { API_BASE_URL } from "@/lib/api/client"

/**
 * CHAT-001..003 — keeps a thread screen in step with its room.
 *
 * A conversation room needs a token to join (unlike an auction room): a
 * thread is private to its two participants (SRS 6), and UserGateway checks
 * that on `conversation:join` using the same identity the rest of the socket
 * connection already proved. Passing no token simply does not connect, same
 * as `useUserChannel`.
 *
 * `onMessage` is called with nothing, not the event payload — the thread's
 * own read (`listMessages`) is also what marks the counterpart's messages
 * read, so a screen that patched a message in from the socket payload instead
 * would show it without ever telling the server it was seen.
 */
export function useConversationRoom(
  conversationId: string,
  token: string | null,
  onMessage: () => void
) {
  useEffect(() => {
    if (!token) return

    const socket = io(`${API_BASE_URL}/user`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    })

    const join = () => socket.emit("conversation:join", { conversationId })

    socket.on("connection:ready", join)
    socket.on("message:sent", onMessage)

    return () => {
      socket.emit("conversation:leave", { conversationId })
      socket.disconnect()
    }
  }, [conversationId, token, onMessage])
}
