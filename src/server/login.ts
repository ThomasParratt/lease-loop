// Signing in (D91). One answer for every failure, `invalid_credentials`, after the same scrypt
// work: an unknown e-mail, a locked account and a wrong password look alike, so nobody learns
// which accounts exist. Five wrong passwords in a row lock the account for 15 minutes
// (src/domain/auth/lockout.ts). A success opens a new session with a fresh token, ends the
// browser's previous one and the account's expired ones, and resets the count. All of it is
// audited; no password, token or hash goes into an audit row.
import { randomUUID } from 'node:crypto';
import { afterFailedLogin, afterSuccessfulLogin, isLocked } from '@/domain/auth/lockout';
import { isSessionLive, sessionExpiry } from '@/domain/auth/sessions';
import { accountActor, findAccountByEmail } from './accounts';
import { withAudit } from './audit';
import { burnPasswordCheck, verifyPassword } from './passwords';
import type { PrismaClient } from './prisma-client';
import { hashSessionToken, newSessionToken } from './sessions';

export type LogInInput = {
  email: string;
  password: string;
  /** The session cookie the browser already had, ended on success. */
  previousToken?: string;
};

export type LogInResult =
  | { ok: true; token: string; expiresAt: string; actor: string }
  | { ok: false; code: 'invalid_credentials' };

const REFUSED: LogInResult = { ok: false, code: 'invalid_credentials' };

/** Checks the e-mail and the password at `now` (an ISO instant) and opens a session. */
export async function logIn(
  db: PrismaClient,
  input: LogInInput,
  now: string
): Promise<LogInResult> {
  const account = await findAccountByEmail(db, input.email);
  const actor = account ? accountActor(account) : null;
  if (!account || actor === null) {
    await burnPasswordCheck(input.password);
    return REFUSED;
  }
  const lock = { failedAttempts: account.failed_attempts, lockedUntil: account.locked_until };
  if (isLocked(lock, now)) {
    await burnPasswordCheck(input.password);
    return REFUSED;
  }

  if (!(await verifyPassword(input.password, account.password_hash))) {
    const { lockedNow, ...next } = afterFailedLogin(lock, now);
    await withAudit(
      db,
      {
        actor: 'anonymous',
        action: lockedNow ? 'account.locked' : 'account.login_failed',
        entityType: 'account',
        entityId: account.id,
        details: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil },
      },
      (tx) =>
        tx.account.update({
          where: { id: account.id },
          data: { failed_attempts: next.failedAttempts, locked_until: next.lockedUntil },
        }),
      now
    );
    return REFUSED;
  }

  const role = account.role === 'admin' ? 'admin' : 'customer';
  const token = newSessionToken();
  const sessionId = `sess-${randomUUID()}`;
  const expiresAt = sessionExpiry(role, now);
  const previousHash = input.previousToken ? hashSessionToken(input.previousToken) : null;
  await withAudit(
    db,
    {
      actor,
      action: 'session.created',
      entityType: 'session',
      entityId: sessionId,
      details: { role, expiresAt },
    },
    async (tx) => {
      const cleared = afterSuccessfulLogin();
      await tx.account.update({
        where: { id: account.id },
        data: { failed_attempts: cleared.failedAttempts, locked_until: cleared.lockedUntil },
      });
      // The browser's previous session (whoever's it was) and this account's expired ones.
      const stale = await tx.session.findMany({
        where: {
          OR: [{ account_id: account.id }, ...(previousHash ? [{ token_hash: previousHash }] : [])],
        },
        select: { id: true, token_hash: true, expires_at: true },
      });
      for (const row of stale) {
        if (row.token_hash === previousHash || !isSessionLive({ expiresAt: row.expires_at }, now)) {
          await tx.session.delete({ where: { id: row.id } });
        }
      }
      await tx.session.create({
        data: {
          id: sessionId,
          token_hash: hashSessionToken(token),
          account_id: account.id,
          expires_at: expiresAt,
        },
      });
    },
    now
  );
  return { ok: true, token, expiresAt, actor };
}
