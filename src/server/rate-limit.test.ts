// D91: more than 20 sign-in tries in 15 minutes from one address are refused until the window ends.
import { describe, expect, it } from 'vitest';
import { createRateLimiter, clientAddress } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows `limit` hits per key in a window, then refuses until it ends', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 1, 2, 3].map((t) => limiter.hit('a', t))).toEqual([true, true, true, false]);
    expect(limiter.hit('b', 3)).toBe(true);
    expect(limiter.hit('a', 999)).toBe(false);
    expect(limiter.hit('a', 1000)).toBe(true);
  });

  it('forgets the oldest key rather than grow without bound', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    limiter.hit('a', 0);
    limiter.hit('b', 0);
    limiter.hit('c', 0);
    expect(limiter.size()).toBe(2);
    expect(limiter.hit('a', 1)).toBe(true);
  });
});

describe('clientAddress', () => {
  const at = (headers: Record<string, string>) =>
    clientAddress(new Request('http://test/api/session', { headers }));

  it('takes the first X-Forwarded-For address, else X-Real-IP, else one shared bucket', () => {
    expect(at({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })).toBe('203.0.113.7');
    expect(at({ 'x-real-ip': '198.51.100.2' })).toBe('198.51.100.2');
    expect(at({})).toBe('unknown');
  });
});
