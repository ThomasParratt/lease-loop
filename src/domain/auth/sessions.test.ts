// D91: a session lasts 24 hours for a customer and 8 for the admin, from sign-in, never extended.
import { describe, expect, it } from 'vitest';
import { SESSION_HOURS, isSessionLive, sessionExpiry } from './sessions';

const SIGN_IN = '2026-11-08T10:00:00.000Z';

describe('sessionExpiry', () => {
  it('gives a customer 24 hours and the admin 8', () => {
    expect(SESSION_HOURS).toEqual({ customer: 24, admin: 8 });
    expect(sessionExpiry('customer', SIGN_IN)).toBe('2026-11-09T10:00:00.000Z');
    expect(sessionExpiry('admin', SIGN_IN)).toBe('2026-11-08T18:00:00.000Z');
  });

  it('crosses a month and a year end', () => {
    expect(sessionExpiry('customer', '2026-12-31T23:30:00.000Z')).toBe('2027-01-01T23:30:00.000Z');
  });

  it('refuses an instant it cannot read', () => {
    expect(() => sessionExpiry('admin', 'yesterday')).toThrow(/instant/);
  });
});

describe('isSessionLive', () => {
  const session = { expiresAt: '2026-11-08T18:00:00.000Z' };

  it('is live up to the last millisecond and over from the expiry instant', () => {
    expect(isSessionLive(session, '2026-11-08T17:59:59.999Z')).toBe(true);
    expect(isSessionLive(session, '2026-11-08T18:00:00.000Z')).toBe(false);
  });

  it('is over when either instant cannot be read (fail closed)', () => {
    expect(isSessionLive({ expiresAt: 'soon' }, SIGN_IN)).toBe(false);
    expect(isSessionLive(session, 'now')).toBe(false);
  });
});
