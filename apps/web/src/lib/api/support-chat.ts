import { authHeader } from '@/lib/api/auth/token';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'USER' | 'ASSISTANT';
  body: string;
  createdAt: string;
}

export interface SendMessageResponse {
  sessionId: string;
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

export async function sendSupportChatMessage(
  message: string,
  sessionId?: string,
): Promise<SendMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/support/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ message, sessionId }),
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
