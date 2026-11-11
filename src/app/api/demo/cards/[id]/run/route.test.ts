// POST /api/demo/cards/:id/run against a real, migrated SQLite database: the app's `db` module
// is pointed at it and seeded with the pack, and the cookies hold the admin's session. The run
// answers its steps and landing page and sets the session's demo clock and the customer it
// acts as (D94); a second click is 409 with the earlier page (D70). Only the admin runs a card.
// With the demo tools off (D74, `DEMO_TOOLS=0`) it answers 404 and runs nothing.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../../../../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../../../../../../tests/helpers/test-db';
import { cookiesFor, SESSION_COOKIE } from '../../../../../../../tests/helpers/sessions';
import type { PrismaClient } from '@/server/prisma-client';
import { hashSessionToken } from '@/server/sessions';

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

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
  await seedPack(holder.db);
  holder.cookies = await cookiesFor(holder.db, 'admin');
});

/** The admin's session row: the demo clock and the customer it acts as. */
const adminSession = () =>
  holder.db.session.findUniqueOrThrow({
    where: { token_hash: hashSessionToken(holder.cookies.get(SESSION_COOKIE)!) },
  });
afterAll(async () => {
  await cleanup();
});

async function run(id: string) {
  const request = new Request(`http://localhost/api/demo/cards/${id}/run`, { method: 'POST' });
  const response = await POST(request, { params: Promise.resolve({ id }) });
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

describe('POST /api/demo/cards/[id]/run with the demo tools off (D74)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 404, sets no cookie and writes nothing', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    const before = await holder.db.auditLog.count();
    const { status, cookies, body } = await run('5');
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(cookies).toEqual([]);
    expect(await holder.db.auditLog.count()).toBe(before);
  });
});

describe('POST /api/demo/cards/[id]/run', () => {
  it('runs card 5, sets the clock and the actor, and names the application page', async () => {
    const { status, cookies, body } = await run('5');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      cardId: 5,
      today: '2026-11-05',
      actor: 'cust-mikko',
      landing: expect.stringMatching(/^\/applications\//),
    });
    expect(cookies).toEqual([]);
    expect(await adminSession()).toMatchObject({ as_of: '2026-11-05', acting_as: 'cust-mikko' });
  });

  it("names the admin in every audit row of the run, with the card's customer as actingAs (D93)", async () => {
    const before = await holder.db.auditLog.count();
    await run('1');
    const rows = await holder.db.auditLog.findMany({ where: { id: { gt: before } } });
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((row) => row.actor))).toEqual(new Set(['admin']));
    expect(rows.some((row) => row.details_json?.includes('"actingAs":"cust-aino"'))).toBe(true);
  });

  it('answers a second click with 409 CARD_ALREADY_RUN and the same page', async () => {
    const first = await run('7');
    const again = await run('7');
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({
      code: 'CARD_ALREADY_RUN',
      details: {
        code: 'card_already_run',
        params: { cardId: 7 },
        landing: first.body.data.landing,
      },
    });
    expect(again.cookies).toEqual([]);
    expect(await adminSession()).toMatchObject({ as_of: first.body.data.today });
  });

  it.each(['0', '11', 'one', '1.5'])('refuses card %s with 400', async (id) => {
    expect((await run(id)).status).toBe(400);
  });
});

describe('POST /api/demo/cards/[id]/run by anyone but the admin (D94)', () => {
  it('is 401 for a visitor and 403 admin_only for a customer, and runs nothing', async () => {
    const admin = holder.cookies;
    const before = await holder.db.auditLog.count();
    try {
      holder.cookies = new Map();
      expect((await run('3')).status).toBe(401);
      holder.cookies = await cookiesFor(holder.db, 'cust-aino');
      const refused = await run('3');
      expect(refused.status).toBe(403);
      expect(refused.body.error.details).toMatchObject({ code: 'admin_only' });
      expect(await holder.db.auditLog.count()).toBe(before);
    } finally {
      holder.cookies = admin;
    }
  });
});
