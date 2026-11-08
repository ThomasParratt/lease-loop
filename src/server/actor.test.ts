// D91, D93: the actor is the session's: anonymous with none, the account that signed in, or
// the customer the admin acts as. A cookie that opens no session is anonymous.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { cookiesFor } from '../../tests/helpers/sessions';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import { noteSessionAccount, runWithRequestContext, sessionAccount } from './request-context';

const holder = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const { effectiveActor, readActor, readSession, sessionState } = await import('./actor');

let db: PrismaClient;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});

describe('readActor', () => {
  it('is anonymous with no cookie and with a cookie that opens no session', async () => {
    holder.cookies = new Map();
    expect(await readActor(db)).toBe('anonymous');
    holder.cookies = await cookiesFor(db, 'cust-nobody');
    expect(await readActor(db)).toBe('anonymous');
  });

  it('is the customer or the admin who signed in', async () => {
    holder.cookies = await cookiesFor(db, 'cust-lena');
    expect(await readActor(db)).toBe('cust-lena');
    holder.cookies = await cookiesFor(db, 'admin');
    expect(await readActor(db)).toBe('admin');
  });

  it('is the customer the admin acts as (D93)', async () => {
    holder.cookies = await cookiesFor(db, 'admin', { actingAs: 'cust-aino' });
    expect(await readActor(db)).toBe('cust-aino');
    expect((await readSession(db))?.account).toBe('admin');
  });

  it("notes the session's own account for the request, for withAudit (D93)", async () => {
    holder.cookies = await cookiesFor(db, 'admin', { actingAs: 'cust-aino' });
    await runWithRequestContext(async () => {
      noteSessionAccount(null);
      await readActor(db);
      expect(sessionAccount()).toBe('admin');
    });
  });
});

describe('effectiveActor and sessionState', () => {
  const admin = {
    id: 's1',
    account: 'admin',
    role: 'admin' as const,
    actingAs: 'cust-aino',
    asOf: '2027-01-01',
    expiresAt: '2026-11-08T18:00:00.000Z',
  };

  it('shows the browser who acts and who signed in, never the token', () => {
    expect(effectiveActor(null)).toBe('anonymous');
    expect(sessionState(admin)).toEqual({
      actor: 'cust-aino',
      account: 'admin',
      actingAs: 'cust-aino',
      asOf: '2027-01-01',
      expiresAt: '2026-11-08T18:00:00.000Z',
    });
    expect(sessionState(null)).toEqual({
      actor: 'anonymous',
      account: null,
      actingAs: null,
      asOf: null,
      expiresAt: null,
    });
  });
});
