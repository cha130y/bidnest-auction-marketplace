import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './payment.service';

@Module({
  providers: [MockPaymentProvider],
  exports: [MockPaymentProvider],
})
export class PaymentModule {}
