import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

/**
 * Named distinctly from support-chat/dto/send-message.dto.ts's own
 * `SendMessageDto` — same class name, different shape, different module.
 * Swagger keys its generated schemas by class name alone, so the two
 * collided into one broken schema until this rename.
 */
export class SendChatMessageDto {
  // CHAT-002 — text only in V1, no file or image attachments
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}
