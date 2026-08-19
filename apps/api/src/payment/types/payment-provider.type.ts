import type { PaymentStatus } from '../../../generated/prisma/enums';

export const PaymentMethod = {
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  E_WALLET: 'E_WALLET'
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export type ChargeInput = {
  checkoutSessionId: string;
  amount: string;
  method: PaymentMethod;
};

export type ChargeResult = {
  status: PaymentStatus;
  /** Simulated provider reference — no real gateway is contacted. */
  reference: string;
  failureReason?: string;
};
