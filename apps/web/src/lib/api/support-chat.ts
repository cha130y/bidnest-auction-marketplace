import { authHeader } from '@/lib/api/auth/token';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ChatMessage {
  id: string;
  /** `null` for a guest turn — nothing was persisted to have an id for. */
  sessionId: string | null;
  role: 'USER' | 'ASSISTANT';
  body: string;
  createdAt: string;
}

export interface SendMessageResponse {
  sessionId: string | null;
  reply: ChatMessage;
  escalated: boolean;
}

export class SupportChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }
}

/**
 * AI-001 — `@Public()` on the API side, so this works signed out too:
 * `authHeader()` sends nothing when there is no session, and the backend
 * answers a guest with a real reply, just without a `sessionId` to persist.
 *
 * `history` is only read by the backend for that guest case — a signed-in
 * caller's history lives server-side against `sessionId` instead, so pass it
 * every time and let the backend decide whether it matters. Capped to the
 * last 10 turns, matching the DTO's own limit.
 */
export async function sendSupportChatMessage(
  message: string,
  sessionId?: string,
  history?: Pick<ChatMessage, 'role' | 'body'>[],
): Promise<SendMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/support/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({
      message,
      sessionId,
      history: history?.slice(-10),
    }),
  });

  if (!response.ok) {
    throw new SupportChatError(
      response.status,
      await parseErrorMessage(response),
    );
  }

  return response.json();
}

export async function fetchSupportChatHistory(
  sessionId: string,
): Promise<ChatMessage[]> {
  const response = await fetch(`${API_BASE_URL}/support/chat/${sessionId}`, {
    headers: await authHeader(),
  });

  if (!response.ok) {
    throw new SupportChatError(
      response.status,
      await parseErrorMessage(response),
    );
  }

  return response.json();
}
