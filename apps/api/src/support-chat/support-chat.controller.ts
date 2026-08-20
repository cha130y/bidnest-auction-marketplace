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
import { SanitizePromptPipe } from '../common/pipes/sanitize-prompt.pipe';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('support/chat')
export class SupportChatController {
  constructor(private readonly supportChatService: SupportChatService) {}

  @Get(':sessionId')
  getHistory(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.supportChatService.getHistory(sessionId, user.id);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(SanitizePromptPipe)
  @Post()
  sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.supportChatService.sendMessage(
      user.id,
      dto.message,
      dto.sessionId
    );
  }
}
