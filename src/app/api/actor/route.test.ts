// POST and DELETE /api/actor (D93): only the admin acts as a customer, on the admin's own
// session; the actor follows, the audit rows name the admin. Real, migrated SQLite database.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../../tests/helpers/reset-db';
import { cookiesFor } from '../../../../tests/helpers/sessions';
import { createTestDb } from '../../../../tests/helpers/test-db';
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
const { readActor } = await import('@/server/actor');

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

async function actAs(actor: string) {
  const request = new Request('http://localhost/api/actor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor }),
  });
  const response = await route.POST(request, undefined);
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

describe('POST /api/actor as the admin', () => {
  it('acts as Aino: no cookie changes, the actor is Aino, the session is still the admin', async () => {
    const { status, cookies, body } = await actAs('cust-aino');
    expect(status).toBe(200);
    expect(cookies).toEqual([]);
    expect(body.data).toMatchObject({
      actor: 'cust-aino',
      account: 'admin',
      actingAs: 'cust-aino',
    });
    expect(await readActor(holder.db)).toBe('cust-aino');
  });

  it('stops with `admin` and with DELETE', async () => {
    await actAs('cust-aino');
    expect((await actAs('admin')).body.data).toMatchObject({ actor: 'admin', actingAs: null });
    await actAs('cust-lena');
    const stopped = await route.DELETE(
      new Request('http://localhost/api/actor', { method: 'DELETE' }),
      undefined
    );
    expect((await stopped.json()).data).toMatchObject({ actor: 'admin', actingAs: null });
  });

  it('switches from one customer to another while acting: the tool asks the session', async () => {
    await actAs('cust-aino');
    expect((await actAs('cust-mikko')).body.data).toMatchObject({ actor: 'cust-mikko' });
  });

  it('refuses a customer that does not exist with 404 UNKNOWN_ACTOR', async () => {
    const { status, body } = await actAs('cust-nobody');
    expect(status).toBe(404);
    expect(body.error.code).toBe('UNKNOWN_ACTOR');
  });

  it('answers 404 while the demo tools are off (D74)', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    expect((await actAs('cust-aino')).status).toBe(404);
    expect(await readActor(holder.db)).toBe('admin');
  });
});

describe('POST /api/actor as anyone else (D93)', () => {
  it('is 401 for a visitor and 403 admin_only for a customer, and writes nothing', async () => {
    const before = await holder.db.auditLog.count();
    holder.cookies = new Map();
    expect((await actAs('admin')).status).toBe(401);
    holder.cookies = await cookiesFor(holder.db, 'cust-mikko');
    const refused = await actAs('cust-aino');
    expect(refused.status).toBe(403);
    expect(refused.body.error.details).toMatchObject({ code: 'admin_only' });
    expect(await readActor(holder.db)).toBe('cust-mikko');
    expect(await holder.db.auditLog.count()).toBe(before);
  });

  it('the old cookie that named the actor in clear text no longer does anything', async () => {
    holder.cookies = new Map([['lease-loop-actor', 'admin']]);
    expect(await readActor(holder.db)).toBe('anonymous');
    expect((await actAs('cust-aino')).status).toBe(401);
  });
});
