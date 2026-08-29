import { Module } from '@nestjs/common';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { SupportChatController } from './support-chat.controller';
import { SupportChatService } from './support-chat.service';

@Module({
  imports: [AiToolsModule],
  controllers: [SupportChatController],
  providers: [SupportChatService]
})
export class SupportChatModule {}
