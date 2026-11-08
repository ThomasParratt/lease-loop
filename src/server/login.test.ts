// D91: signing in against a real, migrated SQLite database. One answer for every failure, a
// lock after five wrong passwords, a fresh token on every sign-in, and audit rows that never
// hold a password, a token or its hash.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadCustomers } from '@/data/load';
import { seedAccounts } from './accounts';
import { verifyAuditChain } from './audit';
import { logIn } from './login';
import type { PrismaClient } from './prisma-client';
import { findLiveSession, hashSessionToken } from './sessions';

const ADMIN_PASSWORD = 'admin-password-for-tests';
const CUSTOMER_PASSWORD = 'customer-password-for-tests';
const NOW = '2026-11-08T10:00:00.000Z';
const AINO = 'aino.virtanen@example.com';

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
  const customers = (await loadCustomers()).filter((c) =>
    ['cust-aino', 'cust-mikko'].includes(c.id)
  );
  await seedAccounts(db, customers, {
    adminEmail: 'admin@lease-loop.test',
    adminPassword: ADMIN_PASSWORD,
    customerPassword: CUSTOMER_PASSWORD,
  });
});

const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

// scrypt is slow on purpose; a busy CI machine needs more than the default 5 s per test.
describe('logIn', { timeout: 30_000 }, () => {
  it('signs Aino in as cust-aino with a 24-hour session; the e-mail is matched in any case', async () => {
    const result = await logIn(
      db,
      { email: '  Aino.Virtanen@Example.com ', password: CUSTOMER_PASSWORD },
      NOW
    );
    expect(result).toMatchObject({
      ok: true,
      actor: 'cust-aino',
      expiresAt: '2026-11-09T10:00:00.000Z',
    });
    if (!result.ok) return;
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await findLiveSession(db, result.token, NOW)).toMatchObject({
      account: 'cust-aino',
      role: 'customer',
      actingAs: null,
    });
  });

  it('signs the admin in as admin for 8 hours', async () => {
    const result = await logIn(
      db,
      { email: 'admin@lease-loop.test', password: ADMIN_PASSWORD },
      NOW
    );
    expect(result).toMatchObject({
      ok: true,
      actor: 'admin',
      expiresAt: '2026-11-08T18:00:00.000Z',
    });
  });

  it('stores only the hash of the token, never the token', async () => {
    const result = await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, NOW);
    if (!result.ok) throw new Error('refused');
    const row = await db.session.findFirstOrThrow();
    expect(row.token_hash).toBe(hashSessionToken(result.token));
    expect(JSON.stringify(row)).not.toContain(result.token);
  });

  it('answers a wrong password, an unknown e-mail and a customer password on the admin alike', async () => {
    const answers = [
      await logIn(db, { email: AINO, password: 'wrong password!' }, NOW),
      await logIn(db, { email: 'nobody@example.com', password: CUSTOMER_PASSWORD }, NOW),
      await logIn(db, { email: 'admin@lease-loop.test', password: CUSTOMER_PASSWORD }, NOW),
    ];
    expect(answers).toEqual(Array(3).fill({ ok: false, code: 'invalid_credentials' }));
    expect(await db.session.count()).toBe(0);
  });

  it('locks Aino after five wrong passwords for 15 minutes, even against the right one', async () => {
    for (let i = 0; i < 5; i++) await logIn(db, { email: AINO, password: `wrong ${i}` }, at(i));
    const account = await db.account.findUniqueOrThrow({ where: { email: AINO } });
    expect(account).toMatchObject({ failed_attempts: 5, locked_until: '2026-11-08T10:19:00.000Z' });
    expect(await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, at(10))).toEqual({
      ok: false,
      code: 'invalid_credentials',
    });
    expect(await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, at(19))).toMatchObject({
      ok: true,
    });
    expect(await db.account.findUniqueOrThrow({ where: { email: AINO } })).toMatchObject({
      failed_attempts: 0,
      locked_until: null,
    });
  });

  it("locks only the account that was tried: Mikko still signs in during Aino's lock", async () => {
    for (let i = 0; i < 5; i++) await logIn(db, { email: AINO, password: `wrong ${i}` }, at(i));
    expect(
      await logIn(db, { email: 'mikko.laine@example.com', password: CUSTOMER_PASSWORD }, at(5))
    ).toMatchObject({ ok: true, actor: 'cust-mikko' });
  });

  it('audits failures, the lock and the sign-in, with no secret in any row', async () => {
    for (let i = 0; i < 5; i++)
      await logIn(db, { email: AINO, password: `secret-attempt-${i}` }, at(i));
    const ok = await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, at(30));
    if (!ok.ok) throw new Error('refused');
    const rows = await db.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.action)).toEqual([
      ...Array(4).fill('account.login_failed'),
      'account.locked',
      'session.created',
    ]);
    expect(rows.at(-1)).toMatchObject({ actor: 'cust-aino', entity_type: 'session' });
    const text = JSON.stringify(rows);
    for (const secret of [
      'secret-attempt',
      CUSTOMER_PASSWORD,
      ok.token,
      hashSessionToken(ok.token),
      'scrypt$',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect((await verifyAuditChain(db)).ok).toBe(true);
  });

  it("gives a fresh token on every sign-in and ends the browser's previous session", async () => {
    const first = await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, NOW);
    if (!first.ok) throw new Error('refused');
    const second = await logIn(
      db,
      { email: 'mikko.laine@example.com', password: CUSTOMER_PASSWORD, previousToken: first.token },
      at(1)
    );
    if (!second.ok) throw new Error('refused');
    expect(second.token).not.toBe(first.token);
    expect(await findLiveSession(db, first.token, at(1))).toBeNull();
    expect(await findLiveSession(db, second.token, at(1))).toMatchObject({ account: 'cust-mikko' });
  });

  it("clears the account's expired sessions on the next sign-in, and keeps its live ones", async () => {
    const old = await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, NOW);
    const live = await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, at(23 * 60 + 30));
    if (!old.ok || !live.ok) throw new Error('refused');
    expect(await db.session.count()).toBe(2);
    await logIn(db, { email: AINO, password: CUSTOMER_PASSWORD }, at(25 * 60));
    expect(await db.session.count()).toBe(2);
    expect(await findLiveSession(db, live.token, at(25 * 60))).not.toBeNull();
  });
});
