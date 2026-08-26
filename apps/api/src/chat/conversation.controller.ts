import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ChatService } from './chat.service';
import { ListMessagesDto } from './dtos/list-messages.dto';
import { SendChatMessageDto } from './dtos/send-message.dto';

// SRS 6 — chat content is private to the two participants, admins included
@Roles('USER')
@Controller('conversations')
export class ConversationController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.chatService.listConversations(userId);
  }

  @Get(':id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Query() dto: ListMessagesDto
  ) {
    return this.chatService.listMessages(id, userId, dto.page, dto.limit);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendChatMessageDto
  ) {
    return this.chatService.sendMessage(id, userId, dto.body);
  }
}
