"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"

import { API_BASE_URL } from "@/lib/api/client"

/**
 * NOT-001..004 — subscribes to the room for one person.
 *
 * A different namespace from `/auctions`, and for the opposite reason: an
 * auction room is public and authenticates nobody, while everything here is
 * addressed to one account. The server proves who a socket belongs to *on
 * connection* and disconnects it if it cannot, so there is never a moment
 * where an unidentified socket is attached — which is why the token goes in
 * the handshake rather than in a join message.
 *
 * Passing no token simply does not connect. That is not a failure worth
 * reporting to anybody: a signed-out visitor has no personal room to be in.
 *
 * `onNotification` is called with nothing. Like the auction room, the handler
 * re-reads rather than trusting a payload — one request, and the list and the
 * badge cannot disagree about what has arrived.
 */
export function useUserChannel(
  token: string | null,
  onNotification: () => void
) {
  useEffect(() => {
    if (!token) return

    const socket = io(`${API_BASE_URL}/user`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    })

    // The server's own "you are in your room" signal, which is a stronger
    // thing than `connect`: it means the token was accepted. Reading here is
    // what loads the first count, so a caller needs no separate fetch.
    socket.on("connection:ready", onNotification)

    // Realtime being unavailable should still leave a correct badge on screen,
    // so the read happens even when the socket cannot be established.
    socket.on("connect_error", onNotification)

    // NOT-001..004 — a bid that took the lead away, a win, an auction ending,
    // an auction withdrawn. Dev 3's order and shipment events land in the same
    // room and are counted by the same badge, which is why this reads again
    // rather than filtering by event name.
    socket.on("notification:created", onNotification)
    socket.on("order:status_changed", onNotification)

    // The server says so and then hangs up. Retrying would not help — the
    // token is the problem — so the socket is closed rather than left to
    // reconnect against a door that will not open.
    socket.on("connection:rejected", () => socket.disconnect())

    return () => {
      socket.disconnect()
    }
  }, [token, onNotification])
}
