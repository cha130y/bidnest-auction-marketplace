import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested
} from 'class-validator';
import { ChatRole } from '../../../generated/prisma/enums';

/**
 * AI-001 — one turn a guest's own browser already holds. Signed-in callers
 * never send this: the server has the real, persisted history for them, and
 * a client-supplied one would just be ignored by sendMessage().
 */
export class GuestHistoryItemDto {
  @IsEnum(ChatRole)
  role: ChatRole;

  @IsString()
  @MaxLength(2000)
  body: string;
}

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GuestHistoryItemDto)
  history?: GuestHistoryItemDto[];
}
