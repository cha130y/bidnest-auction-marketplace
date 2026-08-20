import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { validate } from './config/env.validation';
import { AdminModule } from './admin/admin.module';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate
    }),
    // The global AccessTokenGuard is built in this injector, so JwtService has
    // to be resolvable here too. Secrets are passed per verify call.
    JwtModule.register({}),
    PrismaModule,
    MailModule,
    RealtimeModule,
    AuthModule,
    AuctionModule,
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
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
