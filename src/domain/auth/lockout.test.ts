// D91: five wrong passwords in a row lock an account for 15 minutes; the lock ends by itself.
import { describe, expect, it } from 'vitest';
import {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  afterFailedLogin,
  afterSuccessfulLogin,
  isLocked,
  type LockState,
} from './lockout';

const NOW = '2026-11-08T10:00:00.000Z';
const fresh: LockState = { failedAttempts: 0, lockedUntil: null };

/** `count` failures in a row, one second apart, from `state`. */
function fail(count: number, state: LockState = fresh, start = Date.parse(NOW)) {
  let current = state;
  let lockedNow = false;
  for (let i = 0; i < count; i++) {
    ({ lockedNow, ...current } = afterFailedLogin(
      current,
      new Date(start + i * 1000).toISOString()
    ));
  }
  return { ...current, lockedNow };
}

describe('afterFailedLogin', () => {
  it('counts a failure without locking below the limit', () => {
    expect(fail(MAX_FAILED_ATTEMPTS - 1)).toEqual({
      failedAttempts: MAX_FAILED_ATTEMPTS - 1,
      lockedUntil: null,
      lockedNow: false,
    });
  });

  it(`locks for ${LOCK_MINUTES} minutes on failure number ${MAX_FAILED_ATTEMPTS}`, () => {
    const state = fail(MAX_FAILED_ATTEMPTS);
    expect(state.lockedNow).toBe(true);
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS);
    // The fifth failure is 4 s after NOW.
    expect(state.lockedUntil).toBe('2026-11-08T10:15:04.000Z');
  });

  it('starts counting again once a lock has run out', () => {
    const locked = fail(MAX_FAILED_ATTEMPTS);
    const after = afterFailedLogin(locked, '2026-11-08T10:15:04.000Z');
    expect(after).toEqual({ failedAttempts: 1, lockedUntil: null, lockedNow: false });
  });

  it('does not extend a lock that is still running', () => {
    const locked = fail(MAX_FAILED_ATTEMPTS);
    const during = afterFailedLogin(locked, '2026-11-08T10:10:00.000Z');
    expect(during).toEqual({ ...locked, lockedNow: false });
  });
});

describe('isLocked', () => {
  it('is false with no lock, true until the lock ends, false from the instant it ends', () => {
    expect(isLocked(fresh, NOW)).toBe(false);
    const state = { failedAttempts: 5, lockedUntil: '2026-11-08T10:15:00.000Z' };
    expect(isLocked(state, '2026-11-08T10:14:59.999Z')).toBe(true);
    expect(isLocked(state, '2026-11-08T10:15:00.000Z')).toBe(false);
  });

  it('treats an unreadable lock instant as locked (fail closed)', () => {
    expect(isLocked({ failedAttempts: 5, lockedUntil: 'not a time' }, NOW)).toBe(true);
  });
});

describe('afterSuccessfulLogin', () => {
  it('clears the count and the lock', () => {
    expect(afterSuccessfulLogin()).toEqual(fresh);
  });
});
