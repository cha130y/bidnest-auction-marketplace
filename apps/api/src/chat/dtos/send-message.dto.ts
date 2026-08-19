import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class SendMessageDto {
  // CHAT-002 — text only in V1, no file or image attachments
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}
