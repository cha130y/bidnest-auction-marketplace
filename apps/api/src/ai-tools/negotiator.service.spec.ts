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
});
