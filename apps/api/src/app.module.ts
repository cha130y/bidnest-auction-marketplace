import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupportChatModule } from './support-chat/support-chat.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [SupportChatModule, AdminModule, AiToolsModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
