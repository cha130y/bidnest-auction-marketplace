import { ChatRole } from '../../../generated/prisma/enums';

export class ChatMessageDto {
  id: string;
  /** `null` for a guest turn — nothing was persisted to have an id for. */
  sessionId: string | null;
  role: ChatRole;
  body: string;
  createdAt: Date;
}

export class SendMessageResponseDto {
  /**
   * `null` for a guest caller: there is no session to persist without a
   * userId, so the widget carries its own history instead (see
   * SendMessageDto.history) and never has one to send back.
   */
  sessionId: string | null;
  reply: ChatMessageDto;
  escalated: boolean;
}
