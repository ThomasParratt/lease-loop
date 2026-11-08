// POST /api/demo/clock (D94): the admin moves the demo clock on their own session; a customer or
// a visitor never can. Real, migrated SQLite database; only `db` and the cookies are replaced.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../../../tests/helpers/reset-db';
import { cookiesFor, SESSION_COOKIE } from '../../../../../tests/helpers/sessions';
import { createTestDb } from '../../../../../tests/helpers/test-db';
import type { PrismaClient } from '@/server/prisma-client';
import { hashSessionToken } from '@/server/sessions';
import { todayIso } from '@/server/today';

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

const { POST } = await import('./route');
const { todayForRequest } = await import('@/server/demo-clock');

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
  holder.cookies = await cookiesFor(holder.db, 'admin');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function post(body: unknown) {
  const request = new Request('http://localhost/api/demo/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({}) });
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

const storedAsOf = async () =>
  (
    await holder.db.session.findUniqueOrThrow({
      where: { token_hash: hashSessionToken(holder.cookies.get(SESSION_COOKIE)!) },
    })
  ).as_of;

describe('POST /api/demo/clock as the admin', () => {
  it("travels to a day on the admin's session: no cookie, and today follows", async () => {
    const { status, cookies, body } = await post({ asOf: '2028-02-29' });
    expect(status).toBe(200);
    expect(body.data).toEqual({ asOf: '2028-02-29', today: '2028-02-29' });
    expect(cookies).toEqual([]);
    expect(await storedAsOf()).toBe('2028-02-29');
    expect(await todayForRequest(holder.db)).toBe('2028-02-29');
  });

  it('goes back to the real day with null', async () => {
    await post({ asOf: '2028-02-29' });
    const { status, body } = await post({ asOf: null });
    expect(status).toBe(200);
    expect(body.data).toEqual({ asOf: null, today: todayIso() });
    expect(await storedAsOf()).toBeNull();
  });

  it('refuses a day that does not exist with 400 and changes nothing', async () => {
    const { status } = await post({ asOf: '2026-02-29' });
    expect(status).toBe(400);
    expect(await storedAsOf()).toBeNull();
  });

  it('is audited as the admin', async () => {
    await post({ asOf: '2027-01-01' });
    expect(await holder.db.auditLog.findFirstOrThrow({ orderBy: { id: 'desc' } })).toMatchObject({
      actor: 'admin',
      action: 'session.demo_state_changed',
      entity_type: 'session',
    });
  });

  it('answers 404 while the demo tools are off (D74)', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    expect((await post({ asOf: '2027-01-01' })).status).toBe(404);
    expect(await storedAsOf()).toBeNull();
  });
});

describe('POST /api/demo/clock as anyone else (D94)', () => {
  it('is 401 for a visitor and 403 admin_only for a customer, and writes nothing', async () => {
    const before = await holder.db.auditLog.count();
    holder.cookies = new Map();
    const anonymous = await post({ asOf: '2027-01-01' });
    expect(anonymous.status).toBe(401);
    holder.cookies = await cookiesFor(holder.db, 'cust-aino');
    const customer = await post({ asOf: '2027-01-01' });
    expect(customer.status).toBe(403);
    expect(customer.body.error.details).toMatchObject({ code: 'admin_only' });
    expect(await storedAsOf()).toBeNull();
    expect(await todayForRequest(holder.db)).toBe(todayIso());
    expect(await holder.db.auditLog.count()).toBe(before);
  });

  it('the admin acting as a customer still may: the tool asks the session, not the actor', async () => {
    holder.cookies = await cookiesFor(holder.db, 'admin', { actingAs: 'cust-aino' });
    expect((await post({ asOf: '2027-01-01' })).status).toBe(200);
  });
});
