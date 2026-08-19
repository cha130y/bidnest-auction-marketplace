import { Prisma } from '../../../generated/prisma/client';

export type QuantityDiscountRule = {
  minQty: number | null;
  percent: Prisma.Decimal | null;
};

export type LineTotal = {
  unitPrice: Prisma.Decimal;
  /** Unit price after the quantity discount, if the rule applies. */
  effectiveUnitPrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
};

/**
 * PROD-007 — quantity discount is a plain rule evaluated at display time, never
 * stored on the cart: totals always reflect the seller's current price.
 */
export function calculateLineTotal(
  unitPrice: Prisma.Decimal,
  quantity: number,
  rule: QuantityDiscountRule,
): LineTotal {
  const grossSubtotal = unitPrice.mul(quantity);
  const qualifies =
    rule.minQty !== null && rule.percent !== null && quantity >= rule.minQty;

  if (!qualifies) {
    return {
      unitPrice,
      effectiveUnitPrice: unitPrice,
      discountPercent: null,
      discountAmount: new Prisma.Decimal(0),
      subtotal: grossSubtotal.toDecimalPlaces(2),
    };
  }

  const percent = rule.percent as Prisma.Decimal;
  const effectiveUnitPrice = unitPrice
    .mul(new Prisma.Decimal(100).minus(percent))
    .div(100)
    .toDecimalPlaces(2);
  const subtotal = effectiveUnitPrice.mul(quantity).toDecimalPlaces(2);

  return {
    unitPrice,
    effectiveUnitPrice,
    discountPercent: percent,
    discountAmount: grossSubtotal.minus(subtotal).toDecimalPlaces(2),
    subtotal,
  };
}
