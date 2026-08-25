import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ChatService } from './chat.service';
import { UpdateAutoReplyDto } from './dtos/update-auto-reply.dto';

/**
 * CHAT-004 — the seller's own setting, read and written the same shape as
 * USR-001's own-profile routes (`/users/me/...`), but living in the chat
 * module rather than users.controller.ts: `autoReplyMessage` is a plain
 * column on User (see schema.prisma), not part of UserProfile, and the
 * behaviour it configures — an automatic first message on every order — is
 * entirely CHAT-004's concern.
 */
@Roles('USER')
@Controller('users/me/auto-reply')
export class AutoReplyController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  get(@CurrentUser('id') userId: string) {
    return this.chatService
      .getAutoReplyMessage(userId)
      .then((message) => ({ message }));
  }

  @Patch()
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateAutoReplyDto) {
    return this.chatService
      .setAutoReplyMessage(userId, dto.message)
      .then((message) => ({ message }));
  }
}
