import { apiFetch } from '@/lib/api/client';

export type SupportSessionStatus = 'AI_ONLY' | 'ESCALATED' | 'RESOLVED';

export interface ChatMessage {
  id: string;
  /** `null` for a guest turn — nothing was persisted to have an id for. */
  sessionId: string | null;
  role: 'USER' | 'ASSISTANT' | 'ADMIN';
  body: string;
  createdAt: string;
}

export interface SendMessageResponse {
  sessionId: string | null;
  reply: ChatMessage;
  escalated: boolean;
}

/**
 * AI-001 — `@Public()` on the API side, so this works signed out too:
 * `apiFetch` sends no Authorization header when there is no session, and the
 * backend answers a guest with a real reply, just without a `sessionId` to
 * persist. Routed through `apiFetch` rather than a bare `fetch()` — the
 * original version predated it and grew its own error class and retry-free
 * request logic in parallel, missing AUTH-004's renew-and-retry-once for
 * free.
 *
 * `history` is only read by the backend for that guest case — a signed-in
 * caller's history lives server-side against `sessionId` instead, so pass it
 * every time and let the backend decide whether it matters. Capped to the
 * last 10 turns, matching the DTO's own limit.
 */
export function sendSupportChatMessage(
  message: string,
  sessionId?: string,
  history?: Pick<ChatMessage, 'role' | 'body'>[],
): Promise<SendMessageResponse> {
  return apiFetch<SendMessageResponse>('/support/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      sessionId,
      // Picked field-by-field rather than sent as-is: the caller passes this
      // widget's own ChatMessage[], which also carries id/sessionId/createdAt
      // — fields GuestHistoryItemDto doesn't declare, and the API's
      // whitelist-and-forbid validation rejects rather than silently drops.
      history: history
        ?.slice(-10)
        .map(({ role, body }) => ({ role, body })),
    }),
  });
}

/**
 * "คุยกับแอดมิน" — only reachable once `escalated` has come back true from
 * `sendSupportChatMessage`, and only for a signed-in caller (there is no
 * `sessionId` at all for a guest, since nothing is persisted for one).
 */
export function escalateSupportSession(
  sessionId: string,
): Promise<{ id: string; status: SupportSessionStatus }> {
  return apiFetch(`/support/chat/${sessionId}/escalate`, { method: 'POST' });
}

/**
 * A message into an already-escalated session — no AI reply comes back from
 * this one; the admin's reply arrives over the realtime channel instead (see
 * useSupportSessionRoom).
 */
export function sendSupportSessionMessage(
  sessionId: string,
  body: string,
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/support/chat/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
