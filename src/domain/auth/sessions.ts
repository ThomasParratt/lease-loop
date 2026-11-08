// How long a session lasts (D91): from sign-in, never extended, 24 hours for a customer and 8
// for the admin, whose session can do more. No idle timeout: it would need a write (an audit
// row) on every request. Instants are ISO strings passed in; this module never reads a clock.

export type AccountRole = 'customer' | 'admin';

export const SESSION_HOURS: Readonly<Record<AccountRole, number>> = { customer: 24, admin: 8 };

/** The instant a session opened at `signedInAt` ends. */
export function sessionExpiry(role: AccountRole, signedInAt: string): string {
  const start = Date.parse(signedInAt);
  if (Number.isNaN(start)) throw new Error(`Not an instant: ${signedInAt}`);
  return new Date(start + SESSION_HOURS[role] * 3_600_000).toISOString();
}

/** True before `expiresAt`, false from it on, and false when either instant cannot be read. */
export function isSessionLive(session: { expiresAt: string }, now: string): boolean {
  const end = Date.parse(session.expiresAt);
  const at = Date.parse(now);
  if (Number.isNaN(end) || Number.isNaN(at)) return false;
  return at < end;
}
