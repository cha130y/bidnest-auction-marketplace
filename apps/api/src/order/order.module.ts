import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { CheckoutService } from './checkout.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PaymentModule],
  controllers: [OrderController],
  providers: [OrderService, CheckoutService],
  exports: [OrderService],
})
export class OrderModule {}
