import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupportChatModule } from './support-chat/support-chat.module';
import { AdminModule } from './admin/admin.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';

@Module({
  imports: [SupportChatModule, AdminModule, AiToolsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
