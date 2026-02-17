import { RateLimiter } from '../src/middleware/auth';

describe('Rate Limiter Stress Tests', () => {
  it('allows exactly maxRequests then blocks', () => {
    const limiter = new RateLimiter(50, 60000);
    let allowed = 0;
    let blocked = 0;

    for (let i = 0; i < 100; i++) {
      if (limiter.isAllowed('stress-client')) allowed++;
      else blocked++;
    }

    expect(allowed).toBe(50);
    expect(blocked).toBe(50);
  });

  it('handles 1000 different clients independently', () => {
    const limiter = new RateLimiter(5, 60000);

    for (let i = 0; i < 1000; i++) {
      expect(limiter.isAllowed(`client-${i}`)).toBe(true);
    }
  });

  it('sliding window expires old requests', async () => {
    const limiter = new RateLimiter(3, 100); // 100ms window

    expect(limiter.isAllowed('client')).toBe(true);
    expect(limiter.isAllowed('client')).toBe(true);
    expect(limiter.isAllowed('client')).toBe(true);
    expect(limiter.isAllowed('client')).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(limiter.isAllowed('client')).toBe(true);
  });

  it('interleaved clients do not interfere', () => {
    const limiter = new RateLimiter(2, 60000);

    expect(limiter.isAllowed('A')).toBe(true);
    expect(limiter.isAllowed('B')).toBe(true);
    expect(limiter.isAllowed('A')).toBe(true);
    expect(limiter.isAllowed('B')).toBe(true);
    expect(limiter.isAllowed('A')).toBe(false);
    expect(limiter.isAllowed('B')).toBe(false);
    expect(limiter.isAllowed('C')).toBe(true);
  });

  it('reset clears a client state', () => {
    const limiter = new RateLimiter(1, 60000);

    expect(limiter.isAllowed('X')).toBe(true);
    expect(limiter.isAllowed('X')).toBe(false);

    limiter.reset('X');

    expect(limiter.isAllowed('X')).toBe(true);
  });
});
