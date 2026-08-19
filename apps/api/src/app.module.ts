import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SupportChatModule } from './support-chat/support-chat.module';
import { AdminModule } from './admin/admin.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { validateEnv } from './config/env.validation';
import { MockJwtAuthGuard } from './common/guards/mock-jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule,
    AiToolsModule,
    SupportChatModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ลำดับ APP_GUARD คือลำดับที่ Nest รัน: auth ก่อน แล้วค่อยเช็ค role แล้วค่อย rate-limit
    { provide: APP_GUARD, useClass: MockJwtAuthGuard }, // สลับเป็น JwtAuthGuard จริงใน Phase 6
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
