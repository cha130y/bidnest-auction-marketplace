const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:6666';

const MOCK_USER_ID =
  process.env.NEXT_PUBLIC_MOCK_USER_ID ??
  '00000000-0000-4000-8000-000000000004';

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
  const response = await fetch(`${API_BASE_URL}/support/chat`, );
}
