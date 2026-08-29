import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

/**
 * CHAT-004 — `message: null`, or an empty/whitespace-only string, turns the
 * auto-reply off (the service stores either as `null`); a non-empty string
 * sets it.
 */
export class UpdateAutoReplyDto {
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message: string | null;
}
