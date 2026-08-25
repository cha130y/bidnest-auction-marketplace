import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { PaymentModule } from '../payment/payment.module';
import { CheckoutService } from './checkout.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PaymentModule, ChatModule],
  controllers: [OrderController],
  providers: [OrderService, CheckoutService],
  exports: [OrderService]
})
export class OrderModule {}
