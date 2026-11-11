// A small in-memory rate limit (D91): a fixed window per key, used on sign-in per client
// address. It lives in the server process, so it resets on a restart and is per instance; the
// account lock (src/domain/auth/lockout.ts) is the durable guard. X-Forwarded-For is only as
// trustworthy as the proxy in front of the app: without one a client can set it.

export type RateLimiter = {
  /** Counts a hit for `key` at `nowMs`; false when the key is over its limit in this window. */
  hit(key: string, nowMs: number): boolean;
  /** How many keys are remembered. */
  size(): number;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = options;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, nowMs) {
      const current = windows.get(key);
      if (current && nowMs - current.start < windowMs) {
        current.count += 1;
        return current.count <= limit;
      }
      windows.delete(key);
      // Map keeps insertion order: the first key is the oldest window.
      if (windows.size >= maxKeys) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) windows.delete(oldest);
      }
      windows.set(key, { start: nowMs, count: 1 });
      return true;
    },
    size: () => windows.size,
  };
}

/** The client's address as the proxy reports it, or one shared bucket when nothing says. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
