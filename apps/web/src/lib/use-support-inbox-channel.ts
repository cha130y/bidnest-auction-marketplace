"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"

import { API_BASE_URL } from "@/lib/api/client"

/**
 * The admin-side counterpart to useSupportSessionRoom — every connected
 * admin auto-joins the inbox room on connect (UserGateway#handleConnection),
 * so there's no join message to send here, only events to listen for.
 * Mirrors useUserChannel's shape (re-read on reconnect/connect_error too, so
 * the badge is never wrong just because the socket dropped and came back).
 */
export function useSupportInboxChannel(
  token: string | null,
  onUpdate: () => void,
) {
  useEffect(() => {
    if (!token) return

    const socket = io(`${API_BASE_URL}/user`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    })

    socket.on('connection:ready', onUpdate)
    socket.on('connect_error', onUpdate)
    socket.on('support:inbox_updated', onUpdate)
    socket.on('connection:rejected', () => socket.disconnect())

    return () => {
      socket.disconnect()
    }
  }, [token, onUpdate])
}
