import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A message sent straight to an admin, once a session has been escalated —
 * no `history`/`sessionId` fields like SendSupportChatMessageDto, since
 * there's no guest path and the session id is already in the URL.
 */
export class SendUserMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
