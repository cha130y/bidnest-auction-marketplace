import { Module } from '@nestjs/common';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { ChatModule } from '../chat/chat.module';
import { PaymentModule } from '../payment/payment.module';
import { CheckoutService } from './checkout.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  // AI-003 — CheckoutService redeems the negotiator's accept token, which is
  // the integration point NegotiatorFacadeService was written to expose.
  imports: [PaymentModule, ChatModule, AiToolsModule],
  controllers: [OrderController],
  providers: [OrderService, CheckoutService],
  exports: [OrderService]
})
export class OrderModule {}
