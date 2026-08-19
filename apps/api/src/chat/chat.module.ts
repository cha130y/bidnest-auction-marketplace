import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ConversationController } from './conversation.controller';
import { ProductConversationController } from './product-conversation.controller';

@Module({
  controllers: [ConversationController, ProductConversationController],
  providers: [ChatService]
})
export class ChatModule {}
