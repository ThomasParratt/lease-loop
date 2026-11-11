// GET, POST and DELETE /api/session (D91) against a real, migrated SQLite database; only `db`
// and the request's cookies are replaced.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../../tests/helpers/reset-db';
import { SESSION_COOKIE } from '../../../../tests/helpers/sessions';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { loadCustomers } from '@/data/load';
import { seedAccounts } from '@/server/accounts';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({
  db: undefined as unknown as PrismaClient,
  cookies: new Map<string, string>(),
}));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const route = await import('./route');

const PASSWORD = 'customer-password-for-tests';
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(holder.db);
  await seedPack(holder.db);
  const kettu = (await loadCustomers()).filter((c) => c.id === 'cust-kettukoodi');
  await seedAccounts(holder.db, kettu, {
    adminEmail: 'admin@lease-loop.test',
    adminPassword: 'admin-password-for-tests',
    customerPassword: PASSWORD,
  });
  holder.cookies = new Map();
});

let address = 0;
/** POST /api/session from its own client address, unless one is given. */
async function signIn(body: unknown, headers: Record<string, string> = {}) {
  address += 1;
  const request = new Request('http://localhost:3000/api/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${address % 250}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const response = await route.POST(request, undefined);
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

/** The cookie a browser keeps from a Set-Cookie header. */
function keep(setCookie: string) {
  const [pair] = setCookie.split(';');
  const [name, value] = pair!.split('=');
  holder.cookies = new Map([[name!, value!]]);
}

describe('POST /api/session', { timeout: 30_000 }, () => {
  it('signs Kettu Koodi in: an HttpOnly cookie, and the body says who acts', async () => {
    const { status, cookies, body } = await signIn({
      email: 'it@kettukoodi.example.com',
      password: PASSWORD,
    });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      actor: 'cust-kettukoodi',
      account: 'cust-kettukoodi',
      actingAs: null,
    });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      new RegExp(
        `^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax$`
      )
    );
    expect(JSON.stringify(body)).not.toMatch(/token|hash|password/i);
  });

  it('answers every failure with the same 401 INVALID_CREDENTIALS and no cookie', async () => {
    for (const body of [
      { email: 'it@kettukoodi.example.com', password: 'wrong password' },
      { email: 'nobody@example.com', password: PASSWORD },
    ]) {
      const answer = await signIn(body);
      expect(answer.status).toBe(401);
      expect(answer.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'The e-mail or the password is wrong',
      });
      expect(answer.cookies).toEqual([]);
    }
  });

  it('does not take the customer type, or anything else, from the form (D92)', async () => {
    const answer = await signIn({
      email: 'it@kettukoodi.example.com',
      password: PASSWORD,
      type: 'company',
    });
    expect(answer.status).toBe(400);
  });

  it('refuses more than 20 tries in 15 minutes from one address with 429 (D91)', async () => {
    // A try counts before its body is read, so malformed ones count too (and cost no scrypt).
    const from = { 'x-forwarded-for': '198.51.100.99' };
    for (let i = 0; i < 20; i++) expect((await signIn({}, from)).status).toBe(400);
    const limited = await signIn({ email: 'it@kettukoodi.example.com', password: PASSWORD }, from);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    const elsewhere = await signIn({ email: 'it@kettukoodi.example.com', password: PASSWORD });
    expect(elsewhere.status).toBe(200);
  });

  it('refuses a sign-in posted from another site (CSRF)', async () => {
    const answer = await signIn(
      { email: 'it@kettukoodi.example.com', password: PASSWORD },
      { origin: 'https://evil.example', host: 'localhost:3000' }
    );
    expect(answer.status).toBe(403);
    expect(answer.body.error.code).toBe('CROSS_SITE_REQUEST');
  });
});

describe('GET and DELETE /api/session', { timeout: 30_000 }, () => {
  it('reads the session, then signs out: the row is gone and the cookie cleared', async () => {
    const signedIn = await signIn({ email: 'it@kettukoodi.example.com', password: PASSWORD });
    keep(signedIn.cookies[0]!);
    const read = await route.GET(new Request('http://localhost:3000/api/session'), undefined);
    expect((await read.json()).data).toMatchObject({ actor: 'cust-kettukoodi' });

    const out = await route.DELETE(
      new Request('http://localhost:3000/api/session', { method: 'DELETE' }),
      undefined
    );
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=; .*Max-Age=0`));
    expect(await holder.db.session.count()).toBe(0);

    const after = await route.GET(new Request('http://localhost:3000/api/session'), undefined);
    expect((await after.json()).data).toMatchObject({ actor: 'anonymous', account: null });
  });

  it('signing out with no session is harmless', async () => {
    const out = await route.DELETE(
      new Request('http://localhost:3000/api/session', { method: 'DELETE' }),
      undefined
    );
    expect(out.status).toBe(200);
  });
});
