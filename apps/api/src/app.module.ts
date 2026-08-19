import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriesModule } from './categories/categories.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupportChatModule } from './support-chat/support-chat.module';

@Module({
  imports: [
    CategoriesModule,
    SupportChatModule,
    AdminModule,
    AiToolsModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
