import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { MockAuthGuard } from './common/guards/mock-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { ProductModule } from './product/product.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    DatabaseModule,
    RealtimeModule,
    ProductModule,
    CartModule,
    CategoriesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // MockAuthGuard is Dev 2's JWT guard stand-in — swap useClass when auth lands
    { provide: APP_GUARD, useClass: MockAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
