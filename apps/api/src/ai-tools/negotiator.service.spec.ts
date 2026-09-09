import { NegotiatorService } from './negotiator.service';

describe('NegotiatorService', () => {
  const service = new NegotiatorService();

  it('never accepts below the floor', () => {
    const result = service.decide(99, 100, 200, 1, 10);
    expect(result.decision).toBe('REJECTED');
    expect(result.counterAmount).toBeNull();
  });

  it('accepts an offer at or above the asking price', () => {
    expect(service.decide(200, 100, 200, 1, 10).decision).toBe('ACCEPTED');
    expect(service.decide(250, 100, 200, 1, 10).decision).toBe('ACCEPTED');
  });

  it('counters an offer between the floor and the asking price', () => {
    const result = service.decide(150, 100, 200, 1, 10);
    expect(result.decision).toBe('COUNTERED');
    // Midpoint between the offer (150) and the asking price (200), not the
    // floor — see the comment in negotiator.service.ts for why.
    expect(result.counterAmount).toBe(175);
  });

  it('the counter amount never falls below the offer itself', () => {
    const result = service.decide(199, 100, 200, 1, 10);
    expect(result.decision).toBe('COUNTERED');
    expect(result.counterAmount).toBeGreaterThanOrEqual(199);
  });

  it('rejects when the requested quantity exceeds stock, even at full price', () => {
    const result = service.decide(500, 100, 200, 5, 2);
    expect(result.decision).toBe('REJECTED');
  });

  it('accepts an offer that meets the counter it was given', () => {
    const countered = service.decide(150, 100, 200, 1, 10);
    expect(countered.counterAmount).toBe(175);

    const result = service.decide(
      175,
      100,
      200,
      1,
      10,
      countered.counterAmount
    );
    expect(result.decision).toBe('ACCEPTED');
    expect(result.counterAmount).toBeNull();
  });

  it('counters again when the second offer still falls short of the counter', () => {
    const result = service.decide(160, 100, 200, 1, 10, 175);
    expect(result.decision).toBe('COUNTERED');
    expect(result.counterAmount).toBe(180);
  });

  it('still refuses the floor even when a stale counter sits below it', () => {
    // PROD-002 — the seller raised the floor after the counter was given. The
    // floor is checked first, so the old counter cannot carry a price under it.
    const result = service.decide(175, 180, 200, 1, 10, 175);
    expect(result.decision).toBe('REJECTED');
  });

  it('accepts nothing on a first offer that an outstanding counter would have', () => {
    // Same amount, no counter on the table: the negotiation has not proposed
    // anything yet, so this is an ordinary under-the-asking-price offer.
    const result = service.decide(175, 100, 200, 1, 10);
    expect(result.decision).toBe('COUNTERED');
  });
});
