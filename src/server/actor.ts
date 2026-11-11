// Who is acting (D91, D93). The actor is read from the session cookie: `anonymous` with no live
// session, else the account that signed in (`admin` or a customer id), except that the admin
// acting as a customer is that customer. Pages and routes call `readActor()` once and pass it
// down. The demo tools ask with the session's own account (`readSession`), never the actor.
import { cookies } from 'next/headers';
import type { PrismaClient } from './prisma-client';
import { noteSessionAccount } from './request-context';
import { findLiveSession, SESSION_COOKIE, type SessionView } from './sessions';

export const ADMIN_ACTOR = 'admin';
export const ANONYMOUS_ACTOR = 'anonymous';

/** A customer id, `admin` or `anonymous`. */
export type Actor = string;

/** The actor a session acts as: the customer the admin acts as, else its own account. */
export function effectiveActor(session: SessionView | null): Actor {
  if (session === null) return ANONYMOUS_ACTOR;
  if (session.account === ADMIN_ACTOR && session.actingAs !== null) return session.actingAs;
  return session.account;
}

/** The session cookie's token in this request, if any. */
export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * The live session of the current request, or null. Also notes its account for withAudit
 * (D93). `now` is the server's instant; a session's expiry is never the browser's to say.
 */
export async function readSession(
  db: PrismaClient,
  now: string = new Date().toISOString()
): Promise<SessionView | null> {
  const session = await findLiveSession(db, await readSessionToken(), now);
  noteSessionAccount(session?.account ?? null);
  return session;
}

/** The actor of the current request. Call it in a page or a route, once, and pass it down. */
export async function readActor(db: PrismaClient): Promise<Actor> {
  return effectiveActor(await readSession(db));
}

/** What the browser may know of a session (`sessionStateSchema`): never its token. */
export function sessionState(session: SessionView | null) {
  return {
    actor: effectiveActor(session),
    account: session?.account ?? null,
    actingAs: session?.actingAs ?? null,
    asOf: session?.asOf ?? null,
    expiresAt: session?.expiresAt ?? null,
  };
}
