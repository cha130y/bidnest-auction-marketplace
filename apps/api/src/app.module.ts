import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validate } from './config/env.validation';
import { AdminModule } from './admin/admin.module';
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
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate
    }),
    // The global AccessTokenGuard is built in this injector, so JwtService has
    // to be resolvable here too. Secrets are passed per verify call.
    JwtModule.register({}),
    // Section 6 — a blanket per-IP cap on everything. Individual endpoints
    // tighten it with @ThrottleAuth / @ThrottleOtp. Storage is in-memory,
    // which is right for a single process; Redis is out of scope for V1.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120)
      }
    ]),
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
    UsersModule,
    AuctionModule,
    BidModule,
    ProductModule,
    CartModule,
    OrderModule,
    ShipmentModule,
    CategoriesModule,
    AdminModule,
    ChatModule
  ],
  controllers: [HealthController],
  providers: [
    // Throttling runs first: a request that is over the limit should be turned
    // away before it costs a token verification and a database read.
    //
    // Left off under test for the same reason the scheduler is: every e2e
    // request arrives from 127.0.0.1, so one shared counter would have the
    // suites throttling each other rather than exercising anything. The guard
    // and the decorators are covered directly by
    // common/decorators/throttle-auth.decorator.spec.ts instead.
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
