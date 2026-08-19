import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ChatService } from './chat.service';

@Roles('USER')
@Controller('products')
export class ProductConversationController {
  constructor(private readonly chatService: ChatService) {}

  // CHAT-001 — opened from the product detail page; returns the existing
  // thread when one is already open for this buyer and listing.
  @Post(':id/conversations')
  open(
    @Param('id', ParseUUIDPipe) productId: string,
    @CurrentUser('id') buyerId: string
  ) {
    return this.chatService.openConversation(productId, buyerId);
  }
}
