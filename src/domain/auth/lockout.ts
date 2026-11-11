// Locking an account after wrong passwords (D91). Five wrong passwords in a row lock it for 15
// minutes; the lock ends by itself, and the next failure after it starts the count again. A
// failure while it is locked neither counts nor extends it. A correct password clears both.
// Instants are ISO strings passed in; this module never reads a clock.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type LockState = {
  /** Wrong passwords in a row since the last success or the last lock that ran out. */
  failedAttempts: number;
  /** ISO instant the lock ends, or null when there is none. */
  lockedUntil: string | null;
};

/** True while a lock runs: up to, not including, `lockedUntil`. An unreadable instant locks. */
export function isLocked(state: LockState, now: string): boolean {
  if (state.lockedUntil === null) return false;
  const until = Date.parse(state.lockedUntil);
  const at = Date.parse(now);
  if (Number.isNaN(until) || Number.isNaN(at)) return true;
  return at < until;
}

/** The state after a wrong password at `now`; `lockedNow` is true when this failure locked it. */
export function afterFailedLogin(
  state: LockState,
  now: string
): LockState & { lockedNow: boolean } {
  if (isLocked(state, now)) return { ...state, lockedNow: false };
  const expired = state.lockedUntil !== null;
  const failedAttempts = (expired ? 0 : state.failedAttempts) + 1;
  if (failedAttempts < MAX_FAILED_ATTEMPTS) {
    return { failedAttempts, lockedUntil: null, lockedNow: false };
  }
  const lockedUntil = new Date(Date.parse(now) + LOCK_MINUTES * 60_000).toISOString();
  return { failedAttempts, lockedUntil, lockedNow: true };
}

/** The state after a correct password: no count, no lock. */
export function afterSuccessfulLogin(): LockState {
  return { failedAttempts: 0, lockedUntil: null };
}
