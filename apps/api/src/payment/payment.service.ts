import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChargeInput, ChargeResult } from './types/payment-provider.type';

/**
 * CART-004 / SRS §1.2 — simulated payment only. This never contacts a real
 * gateway and no money moves. Swapping in a real provider later means
 * reimplementing `charge()` behind the same signature.
 */
@Injectable()
export class MockPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  /**
   * Charging this exact amount always declines, so the FAILED branch stays
   * demonstrable. Matched exactly rather than by prefix — a prefix rule would
   * also reject real totals like 6,660 or 66,600 THB.
   */
  static readonly DECLINE_AMOUNT = '666.00';

  charge(input: ChargeInput): ChargeResult {
    const shouldFail = input.amount === MockPaymentProvider.DECLINE_AMOUNT;

    const result: ChargeResult = shouldFail
      ? {
          status: 'FAILED',
          reference: `mock_decline_${randomUUID()}`,
          failureReason: 'Simulated decline'
        }
      : { status: 'SUCCEEDED', reference: `mock_ok_${randomUUID()}` };

    this.logger.log(
      `[simulated] charge ${input.amount} via ${input.method} -> ${result.status}`
    );

    return result;
  }
}
