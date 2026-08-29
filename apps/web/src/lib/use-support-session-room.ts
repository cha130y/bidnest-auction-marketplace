"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"

import { API_BASE_URL } from "@/lib/api/client"

/**
 * The escalated half of the AI-001 chat widget — mirrors
 * use-conversation-room.ts exactly. A support session needs a token to join
 * (its owner, or any admin — UserGateway checks that on `support:join`), so
 * passing no token simply does not connect.
 *
 * Unlike a conversation thread, the payload IS patched straight into the
 * caller's state (`onMessage` receives the new `ChatMessage`, not a "go
 * re-fetch" signal) — there's no read-receipt side effect here for a re-fetch
 * to trigger, so there's nothing a direct append would miss.
 */
export function useSupportSessionRoom(
  sessionId: string | undefined,
  token: string | null,
  onMessage: (message: unknown) => void,
) {
  useEffect(() => {
    if (!token || !sessionId) return

    const socket = io(`${API_BASE_URL}/user`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    })

    const join = () => socket.emit('support:join', { sessionId })

    socket.on('connection:ready', join)
    socket.on('support:message', onMessage)

    return () => {
      socket.emit('support:leave', { sessionId })
      socket.disconnect()
    }
  }, [sessionId, token, onMessage])
}
