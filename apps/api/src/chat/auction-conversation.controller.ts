import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ChatService } from './chat.service';

@Roles('USER')
@Controller('auctions')
export class AuctionConversationController {
  constructor(private readonly chatService: ChatService) {}

  // CHAT-004 — opened from the auction detail page; mirrors
  // ProductConversationController for the auction side of the platform.
  @Post(':id/conversations')
  open(
    @Param('id', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') buyerId: string
  ) {
    return this.chatService.openAuctionConversation(auctionId, buyerId);
  }
}
