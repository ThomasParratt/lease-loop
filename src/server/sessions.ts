// Sessions (D91): who a browser is signed in as. The cookie holds a random 32-byte token; the
// `Session` row holds only its SHA-256, so a copied database opens no session. A session ends
// at its expiry (src/domain/auth/sessions.ts) or when it is deleted on sign-out. The admin's
// session also carries the demo tools' state (D93, D94): the customer it acts as and the day
// it runs on, set only by admin routes. The auth slice owns `Account` and `Session`.
import { createHash, randomBytes } from 'node:crypto';
import { accountRoleSchema, isSessionLive, type AccountRole } from '@/domain/auth/sessions';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';

/** Secure cookies (and the `__Host-` prefix, which needs them) in a production build only. */
export const SECURE_COOKIES = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = SECURE_COOKIES ? '__Host-lease-loop-session' : 'lease-loop-session';

const TOKEN_BYTES = 32;
/** A token is 43 base64url characters; anything much longer is not one of ours. */
const MAX_TOKEN_LENGTH = 64;

/** A new session token for the cookie. */
export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** What the database stores for a token: its SHA-256, hex. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieAttributes(maxAgeSeconds: number): string {
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${SECURE_COOKIES ? '; Secure' : ''}`;
}

/** `Set-Cookie` value for a new session that lasts `maxAgeSeconds`. */
export function sessionCookieHeader(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(Math.max(0, Math.floor(maxAgeSeconds)))}`;
}

/** `Set-Cookie` value that forgets the session. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

export type SessionView = {
  id: string;
  /** Who signed in: `admin` or a customer id. */
  account: string;
  role: AccountRole;
  /** The customer the admin acts as (D93), or null. */
  actingAs: string | null;
  /** The demo clock's day on this session (D94), or null for the real day. */
  asOf: string | null;
  expiresAt: string;
};

/** The live session `token` opens at `now`, or null (no token, unknown, expired). */
export async function findLiveSession(
  db: PrismaClient,
  token: string | undefined,
  now: string
): Promise<SessionView | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const row = await db.session.findUnique({
    where: { token_hash: hashSessionToken(token) },
    include: { account: { select: { role: true, customer_id: true } } },
  });
  if (!row || !isSessionLive({ expiresAt: row.expires_at }, now)) return null;
  const role = accountRoleSchema.safeParse(row.account.role);
  if (!role.success) return null;
  const account = role.data === 'admin' ? 'admin' : row.account.customer_id;
  if (account === null) return null;
  return {
    id: row.id,
    account,
    role: role.data,
    actingAs: role.data === 'admin' ? row.acting_as : null,
    asOf: row.as_of,
    expiresAt: row.expires_at,
  };
}

/** Sign-out: deletes the session row, audited, so the token opens nothing from now on. */
export async function endSession(db: PrismaClient, session: SessionView): Promise<void> {
  await withAudit(
    db,
    {
      actor: session.account,
      action: 'session.ended',
      entityType: 'session',
      entityId: session.id,
    },
    (tx) => tx.session.delete({ where: { id: session.id } })
  );
}

export type DemoState = { actingAs?: string | null; asOf?: string | null };

/**
 * Sets who the admin's session acts as and the day it runs on (D93, D94). The caller has
 * authorized the admin and checked the customer and the day; this only writes, audited.
 */
export async function setDemoState(
  db: PrismaClient,
  session: SessionView,
  patch: DemoState
): Promise<SessionView> {
  const data = {
    ...(patch.actingAs !== undefined ? { acting_as: patch.actingAs } : {}),
    ...(patch.asOf !== undefined ? { as_of: patch.asOf } : {}),
  };
  await withAudit(
    db,
    {
      actor: session.account,
      action: 'session.demo_state_changed',
      entityType: 'session',
      entityId: session.id,
      details: patch,
    },
    (tx) => tx.session.update({ where: { id: session.id }, data })
  );
  return {
    ...session,
    ...(patch.actingAs !== undefined ? { actingAs: patch.actingAs } : {}),
    ...(patch.asOf !== undefined ? { asOf: patch.asOf } : {}),
  };
}
