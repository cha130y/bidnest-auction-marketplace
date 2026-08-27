import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupportChatService } from './support-chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../common/decorators/optional-current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { Throttle } from '@nestjs/throttler';
import { ApiResponse } from '@nestjs/swagger';
import { SanitizePromptPipe } from '../common/pipes/sanitize-prompt.pipe';
import { SendSupportChatMessageDto } from './dto/send-message.dto';
import { SendUserMessageDto } from './dto/send-user-message.dto';
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

  // AI-001 — answers a basic question with no account at all; a token, if one
  // comes along, is still honoured (AccessTokenGuard sets request.user either
  // way), which is what lets a signed-in caller get their persisted history
  // and a guest get a stateless, single-request answer from the same route.
  @Public()
  @ApiResponse({ status: 201, type: SendMessageResponseDto })
  // ThrottlerGuard is a global APP_GUARD now (see app.module.ts) — @Throttle
  // here overrides the blanket per-IP limit for this route only, no
  // @UseGuards needed (adding it back would run the guard twice per request)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  sendMessage(
    // Scoped to this one parameter rather than @UsePipes() at the method
    // level: a method-level pipe runs against *every* parameter's resolved
    // value, including @OptionalCurrentUser()'s — which is `undefined` for a
    // guest, and this pipe reads `.message` off whatever it is handed.
    @Body(SanitizePromptPipe) dto: SendSupportChatMessageDto,
    @OptionalCurrentUser() user: AuthenticatedUser | undefined
  ): Promise<SendMessageResponseDto> {
    return this.supportChatService.sendMessage(
      user?.id,
      dto.message,
      dto.sessionId,
      dto.history
    );
  }

  /**
   * "คุยกับแอดมิน" — requires a real session, which requires being signed in
   * (no `@Public()`/`@OptionalCurrentUser()` here), which is what makes
   * "guest can't talk to admin" true without any separate check.
   */
  @Post(':sessionId/escalate')
  escalate(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.supportChatService.escalate(sessionId, user.id);
  }

  /**
   * A message into an already-escalated session — no AI call, straight to an
   * admin, so SanitizePromptPipe does not apply here: that pipe defends the
   * Gemini prompt specifically (and reads `.message`, a field this DTO
   * doesn't have).
   */
  @Post(':sessionId/messages')
  sendMessageToAdmin(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendUserMessageDto
  ): Promise<ChatMessageDto> {
    return this.supportChatService.sendUserMessageToAdmin(
      sessionId,
      user.id,
      dto.body
    );
  }
}
