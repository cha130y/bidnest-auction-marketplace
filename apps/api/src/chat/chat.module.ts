import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuctionConversationController } from './auction-conversation.controller';
import { AutoReplyController } from './auto-reply.controller';
import { ConversationController } from './conversation.controller';
import { ProductConversationController } from './product-conversation.controller';

@Module({
  controllers: [
    ConversationController,
    ProductConversationController,
    AuctionConversationController,
    AutoReplyController
  ],
  providers: [ChatService],
  exports: [ChatService]
})
export class ChatModule {}
