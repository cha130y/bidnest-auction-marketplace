"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"

import { API_BASE_URL } from "@/lib/api/client"
import { getAuthToken } from "@/lib/api/auth/token"

/**
 * Everything the server broadcasts into an auction's room.
 *
 * Listed rather than wildcarded so a new event has to be considered here
 * before a screen starts reacting to it — and so this file reads as the list
 * of things that can change an auction while somebody is watching it.
 */
const ROOM_EVENTS = [
  /** BID-003 — somebody bid; price, leader and minimum next bid all moved. */
  "auction:bid",
  /** BID-004 — anti-sniping pushed the deadline back. */
  "auction:extension",
  /** LIV-001 — somebody joined or left. */
  "auction:presence",
  /** The scheduled start came round. */
  "auction:started",
  /** AUC-007 — it settled, so there is a result now. */
  "auction:ended",
  /** AUC-006 / ADM-001 — it was withdrawn. */
  "auction:cancelled",
] as const

/**
 * LIV-002 — keeps a screen in step with an auction's room.
 *
 * `onChange` is called when something happened, not told what: every handler
 * re-reads the arena. That is deliberate. The arena is a set of values that
 * have to agree — price, leader, minimum next bid, deadline, extensions left —
 * and the API computes them together, so patching one field from an event
 * payload is how a screen ends up offering a bid the endpoint will refuse.
 * One extra request per event buys a state that is always internally
 * consistent.
 *
 * The token is optional and changes nothing about what the room sends: an
 * auction room is public (AUC-005), and a socket without one sees everything.
 * All it buys is being noticed when the connection drops, so LIV-001's
 * participant count stops including somebody who closed the tab.
 *
 * `onChange` also runs on connect, which is not redundant: the server-rendered
 * copy of the arena was fetched without a token, so `you` — and `isYours` on
 * the bids — arrive only on a read the browser makes.
 */
export function useAuctionRoom(auctionId: string, onChange: () => void) {
  useEffect(() => {
    const socket = io(`${API_BASE_URL}/auctions`, {
      // The room is worth reconnecting to: an auction people are watching is
      // exactly where a dropped connection matters most.
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    })

    const join = () => {
      // Awaited rather than read inline: the token lives in an httpOnly
      // session cookie now (AUTH-008), so `getAuthToken()` is async. Emitting
      // the promise itself would put `{}` on the wire — a promise carries no
      // enumerable properties — and the gateway reads anything that is not a
      // string as anonymous, costing LIV-001 the one thing the token is for:
      // noticing that this person's connection has gone.
      void getAuthToken().then((token) => {
        // The room may already have been left while the session was read.
        if (!socket.connected) return
        socket.emit("auction:join", { auctionId, token: token ?? undefined })
      })

      // Not behind the token: the arena read sends its own bearer, so the
      // screen has no reason to wait for the session on its way to the room.
      onChange()
    }

    socket.on("connect", join)

    // Realtime being unavailable should not leave a signed-in visitor looking
    // at a page that thinks they are signed out, so the token-aware read still
    // happens even when the socket cannot be established.
    socket.on("connect_error", onChange)

    for (const event of ROOM_EVENTS) socket.on(event, onChange)

    return () => {
      // Leaving the room before disconnecting keeps LIV-001's bookkeeping
      // honest on a client that navigates away rather than closing the tab.
      socket.emit("auction:leave", { auctionId })
      socket.disconnect()
    }
  }, [auctionId, onChange])
}
