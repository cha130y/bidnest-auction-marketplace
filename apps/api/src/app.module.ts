import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './config/env.validation';
import { AdminModule } from './admin/admin.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
import { BidModule } from './bid/bid.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { ChatModule } from './chat/chat.module';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { OrderModule } from './order/order.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ShipmentModule } from './shipment/shipment.module';
import { SupportChatModule } from './support-chat/support-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate
    }),
    // AI-001 rate-limit (SRS §6) — เฉพาะของ Dev 5 เท่านั้น ไม่กระทบ guard/module อื่น
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    // The global AccessTokenGuard is built in this injector, so JwtService has
    // to be resolvable here too. Secrets are passed per verify call.
    JwtModule.register({}),
    // Timers are left out under test. AuctionLifecycleService moves auctions on
    // a schedule (AUC-005 / AUC-007), and a background pass firing mid-suite
    // would race the very transitions the tests assert on — and keep Jest alive
    // after they finish. The lifecycle methods are called directly in tests
    // instead, so the logic is still covered.
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
    PrismaModule,
    MailModule,
    RealtimeModule,
    AuthModule,
    AuctionModule,
    BidModule,
    ProductModule,
    CartModule,
    OrderModule,
    ShipmentModule,
    CategoriesModule,
    AdminModule,
    ChatModule,
    AiToolsModule,
    SupportChatModule
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
