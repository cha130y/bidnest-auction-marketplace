import {
  ChatRole,
  SupportSessionStatus
} from '../../../generated/prisma/enums';

export class ChatMessageDto {
  id: string;
  /** `null` for a guest turn — nothing was persisted to have an id for. */
  sessionId: string | null;
  role: ChatRole;
  body: string;
  createdAt: Date;
}

/**
 * A widget rehydrating a persisted session (e.g. after closing and reopening
 * the popover) needs `status` as much as the messages themselves — it's what
 * decides whether the next thing typed goes to the AI or straight to an admin.
 */
export class GetHistoryResponseDto {
  status: SupportSessionStatus;
  messages: ChatMessageDto[];
}

export class SendMessageResponseDto {
  /**
   * `null` for a guest caller: there is no session to persist without a
   * userId, so the widget carries its own history instead (see
   * SendSupportChatMessageDto.history) and never has one to send back.
   */
  sessionId: string | null;
  reply: ChatMessageDto;
  escalated: boolean;
}
