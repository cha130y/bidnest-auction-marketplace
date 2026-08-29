import { Prisma } from '../../../generated/prisma/client';
import { calculateReserveMet } from './calculate-reserve-met.util';

const dec = (value: string | number) => new Prisma.Decimal(value);

describe('calculateReserveMet (AUC-003)', () => {
  it('is false below the reserve', () => {
    expect(calculateReserveMet(dec(4499), dec(4500))).toBe(false);
  });

  it('is true at exactly the reserve', () => {
    expect(calculateReserveMet(dec(4500), dec(4500))).toBe(true);
  });

  it('is true above the reserve', () => {
    expect(calculateReserveMet(dec(9999), dec(4500))).toBe(true);
  });

  it('compares by value, so trailing zeros do not change the answer', () => {
    expect(calculateReserveMet(dec('4500.00'), dec('4500.000'))).toBe(true);
  });

  it('handles satang-level differences the way Decimal does, not floats', () => {
    expect(calculateReserveMet(dec('4499.99'), dec('4500.00'))).toBe(false);
    expect(calculateReserveMet(dec('4500.01'), dec('4500.00'))).toBe(true);
  });

  // No reserve means no bar to clear — and answering `true` keeps an auction
  // without a reserve indistinguishable from one whose reserve has been met.
  it('is true when the auction has no reserve', () => {
    expect(calculateReserveMet(dec(0), null)).toBe(true);
  });

  it('is true with no reserve even before the first bid', () => {
    expect(calculateReserveMet(dec(0), null)).toBe(true);
  });
});
