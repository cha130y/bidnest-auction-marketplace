/**
 * CART-004 — one reason a line cannot be bought right now.
 *
 * The two stock codes are spelled exactly as `cart.service.ts` spells its own
 * (`detectIssue`), on purpose: the cart screen already turns those two strings
 * into Thai, and a checkout that refuses for the same reason should say the
 * same words rather than invent a second vocabulary for the same facts.
 */
export const CheckoutIssueCode = {
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  OWN_LISTING: 'OWN_LISTING',
  NOT_IN_CART: 'NOT_IN_CART'
} as const;

export type CheckoutIssueCode =
  (typeof CheckoutIssueCode)[keyof typeof CheckoutIssueCode];

export type CheckoutIssue = {
  code: CheckoutIssueCode;
  /** Null when the line is gone entirely and there is no listing left to name. */
  productId: string | null;
  title: string;
  /** How many are really on the shelf. Null when the refusal is not about count. */
  available: number | null;
  requested: number | null;
  message: string;
};

/** The slice of a cart line this gate measures — nothing else is read. */
export type LineToCheck = {
  quantity: number;
  product: {
    id: string;
    title: string;
    sellerId: string;
    status: string;
    stockQty: number;
  };
};

/**
 * Every reason the given lines cannot be paid for, in cart order.
 *
 * Collects them all rather than stopping at the first, which is the same call
 * `validateDraftForPublish` made for the publish gate and for the same reason:
 * a buyer with two dead lines should be told about two dead lines, not sent to
 * fix one, refused again, and left to guess how many more rounds this takes.
 *
 * An empty array means every line is buyable.
 */
export function collectCheckoutIssues(
  buyerId: string,
  lines: LineToCheck[]
): CheckoutIssue[] {
  const issues: CheckoutIssue[] = [];

  for (const { quantity, product } of lines) {
    // Order matters: a paused listing has a stale `stockQty`, and telling
    // somebody how many are left of something nobody can buy is noise.
    if (product.status !== 'ACTIVE') {
      issues.push({
        code: CheckoutIssueCode.PRODUCT_UNAVAILABLE,
        productId: product.id,
        title: product.title,
        available: null,
        requested: quantity,
        message: `"${product.title}" is no longer available`
      });
      continue;
    }

    if (product.sellerId === buyerId) {
      issues.push({
        code: CheckoutIssueCode.OWN_LISTING,
        productId: product.id,
        title: product.title,
        available: null,
        requested: quantity,
        message: `"${product.title}" is your own listing and cannot be purchased`
      });
      continue;
    }

    if (quantity > product.stockQty) {
      issues.push({
        code: CheckoutIssueCode.INSUFFICIENT_STOCK,
        productId: product.id,
        title: product.title,
        available: product.stockQty,
        requested: quantity,
        message: `Only ${product.stockQty} unit(s) of "${product.title}" are in stock`
      });
    }
  }

  return issues;
}

/**
 * The lines the buyer picked that are not in their cart any more — removed in
 * another tab, or bought there.
 *
 * Named without a title because there is nothing left to read one from: the
 * row is gone. The screen says how many rather than which, which is what the
 * message has always said.
 */
export function missingCartLineIssue(count: number): CheckoutIssue {
  return {
    code: CheckoutIssueCode.NOT_IN_CART,
    productId: null,
    title: '',
    available: null,
    requested: null,
    message: `${count} selected item(s) are no longer in your cart`
  };
}

/**
 * The one line that lost the race for the last unit, after the charge.
 *
 * `available` is deliberately not read back: this is built inside a
 * transaction that is about to roll back, and a number read there would be the
 * number this buyer's own rolled-back decrement produced, not the truth. The
 * cart is refetched on the way back to it and answers properly.
 */
export function stockLostIssue(
  productId: string,
  title: string,
  requested: number
): CheckoutIssue {
  return {
    code: CheckoutIssueCode.INSUFFICIENT_STOCK,
    productId,
    title,
    available: null,
    requested,
    message: `"${title}" ran out of stock while checking out`
  };
}
