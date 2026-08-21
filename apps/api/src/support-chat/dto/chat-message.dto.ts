import { ChatRole } from '../../../generated/prisma/enums';

export class ChatMessageDto {
  id: string;
  sessionId: string;
  role: ChatRole;
  body: string;
  createdAt: Date;
}

export class SendMessageResponseDto {
  sessionId: string;
  reply: ChatMessageDto;
  escalated: boolean;
}
