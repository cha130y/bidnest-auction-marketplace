import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes
} from '@nestjs/common';
import { SupportChatService } from './support-chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiResponse } from '@nestjs/swagger';
import { SanitizePromptPipe } from '../common/pipes/sanitize-prompt.pipe';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatMessageDto, SendMessageResponseDto } from './dto/chat-message.dto';

@Controller('support/chat')
export class SupportChatController {
  constructor(private readonly supportChatService: SupportChatService) {}

  @ApiResponse({ status: 200, type: [ChatMessageDto] })
  @Get(':sessionId')
  getHistory(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ChatMessageDto[]> {
    return this.supportChatService.getHistory(sessionId, user.id);
  }

  @ApiResponse({ status: 201, type: SendMessageResponseDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(SanitizePromptPipe)
  @Post()
  sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<SendMessageResponseDto> {
    return this.supportChatService.sendMessage(
      user.id,
      dto.message,
      dto.sessionId
    );
  }
}
