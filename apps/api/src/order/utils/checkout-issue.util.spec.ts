import {
  CheckoutIssueCode,
  collectCheckoutIssues,
  missingCartLineIssue,
  stockLostIssue,
  type LineToCheck
} from './checkout-issue.util';

const BUYER = 'buyer-1';
const SELLER = 'seller-1';

const line = (overrides: Partial<LineToCheck['product']> = {}, quantity = 1) =>
  ({
    quantity,
    product: {
      id: 'p1',
      title: 'Keyboard',
      sellerId: SELLER,
      status: 'ACTIVE',
      stockQty: 5,
      ...overrides
    }
  }) satisfies LineToCheck;

describe('collectCheckoutIssues', () => {
  it('says nothing about a line that can be bought', () => {
    expect(collectCheckoutIssues(BUYER, [line()])).toEqual([]);
  });

  it('flags a listing that is not active', () => {
    const [issue] = collectCheckoutIssues(BUYER, [line({ status: 'PAUSED' })]);

    expect(issue.code).toBe(CheckoutIssueCode.PRODUCT_UNAVAILABLE);
    expect(issue.message).toBe('"Keyboard" is no longer available');
  });

  it('flags a line the stock no longer covers, and says by how much', () => {
    const [issue] = collectCheckoutIssues(BUYER, [line({ stockQty: 1 }, 3)]);

    expect(issue.code).toBe(CheckoutIssueCode.INSUFFICIENT_STOCK);
    expect(issue.available).toBe(1);
    expect(issue.requested).toBe(3);
    expect(issue.message).toBe('Only 1 unit(s) of "Keyboard" are in stock');
  });

  it('flags the buyer trying to buy their own listing', () => {
    const [issue] = collectCheckoutIssues(BUYER, [line({ sellerId: BUYER })]);

    expect(issue.code).toBe(CheckoutIssueCode.OWN_LISTING);
  });

  it('counts nothing wrong when the stock exactly covers the line', () => {
    expect(collectCheckoutIssues(BUYER, [line({ stockQty: 2 }, 2)])).toEqual(
      []
    );
  });

  /*
   * The reason this returns an array at all. Stopping at the first problem
   * sends a buyer round the loop once per dead line; the cart screen shows
   * them all at once and this has to agree with it.
   */
  it('reports every unbuyable line, not just the first', () => {
    const issues = collectCheckoutIssues(BUYER, [
      line({ id: 'a', title: 'Gone', status: 'PAUSED' }),
      line({ id: 'b', title: 'Fine' }),
      line({ id: 'c', title: 'Short', stockQty: 0 }, 2)
    ]);

    expect(issues.map((issue) => issue.title)).toEqual(['Gone', 'Short']);
  });

  it('gives a paused listing one reason, not two', () => {
    // Its stockQty is stale once it leaves the shelf, so "0 left" alongside
    // "not for sale" would be noise at best and wrong at worst.
    const issues = collectCheckoutIssues(BUYER, [
      line({ status: 'OUT_OF_STOCK', stockQty: 0 }, 2)
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(CheckoutIssueCode.PRODUCT_UNAVAILABLE);
  });
});

describe('missingCartLineIssue', () => {
  it('counts the lines rather than naming them, since they are gone', () => {
    const issue = missingCartLineIssue(2);

    expect(issue.code).toBe(CheckoutIssueCode.NOT_IN_CART);
    expect(issue.productId).toBeNull();
    expect(issue.message).toBe('2 selected item(s) are no longer in your cart');
  });
});

describe('stockLostIssue', () => {
  it('does not claim to know how many are left', () => {
    // Built mid-rollback: any count read there is this buyer's own doomed
    // decrement, not the truth.
    expect(stockLostIssue('p1', 'Keyboard', 1).available).toBeNull();
  });

  it('keeps the sentence the route has always answered with', () => {
    expect(stockLostIssue('p1', 'Keyboard', 1).message).toBe(
      '"Keyboard" ran out of stock while checking out'
    );
  });
});
