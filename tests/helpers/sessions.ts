// Signing a test in (D91): creates the account and a live session straight in the test
// database and returns the cookie a browser would send, for tests that replace `next/headers`
// cookies with a map. No password is hashed (the account cannot sign in through the form);
// the sign-in itself is tested in src/server/login.test.ts. `asOf` sets the session's demo
// clock (D94), `actingAs` the customer the admin acts as (D93).
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/server/prisma-client';
import { hashSessionToken, newSessionToken, SESSION_COOKIE } from '@/server/sessions';

export { SESSION_COOKIE };

export type SignInOptions = { asOf?: string; actingAs?: string };

const FAR_FUTURE = '2999-01-01T00:00:00.000Z';

/**
 * A session token for `actor` (`admin` or a customer id in the database). An actor with no
 * customer row (`cust-nobody`, `anonymous`) gets a token that opens no session.
 */
export async function sessionTokenFor(
  db: PrismaClient,
  actor: string,
  options: SignInOptions = {}
): Promise<string> {
  const token = newSessionToken();
  const customer =
    actor === 'admin' ? null : await db.customer.findUnique({ where: { id: actor } });
  if (actor !== 'admin' && !customer) return token;
  const email = customer ? customer.email.toLowerCase() : 'admin@lease-loop.test';
  const account = await db.account.upsert({
    where: { email },
    update: {},
    create: {
      email,
      role: actor === 'admin' ? 'admin' : 'customer',
      customer_id: customer?.id ?? null,
      password_hash: 'disabled',
    },
  });
  await db.session.create({
    data: {
      id: `sess-${randomUUID()}`,
      token_hash: hashSessionToken(token),
      account_id: account.id,
      expires_at: FAR_FUTURE,
      acting_as: options.actingAs ?? null,
      as_of: options.asOf ?? null,
    },
  });
  return token;
}

/** The cookie map entries for `actor`, or none for `undefined` (no cookie at all). */
export async function cookiesFor(
  db: PrismaClient,
  actor: string | undefined,
  options: SignInOptions = {}
): Promise<Map<string, string>> {
  if (actor === undefined) return new Map();
  return new Map([[SESSION_COOKIE, await sessionTokenFor(db, actor, options)]]);
}
