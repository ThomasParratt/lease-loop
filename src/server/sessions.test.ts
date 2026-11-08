// D91, D93, D94: a session opens only with its token, only until it expires, and only while
// its row exists; the cookie is HttpOnly and SameSite=Lax; the admin's session holds the
// customer it acts as and the demo clock.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { sessionTokenFor } from '../../tests/helpers/sessions';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import {
  clearSessionCookieHeader,
  endSession,
  findLiveSession,
  hashSessionToken,
  newSessionToken,
  SESSION_COOKIE,
  sessionCookieHeader,
  setDemoState,
} from './sessions';

const NOW = '2026-11-08T10:00:00.000Z';
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

describe('tokens and cookies', () => {
  it('makes a new 32-byte token each time and hashes it with SHA-256', () => {
    const token = newSessionToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(newSessionToken()).not.toBe(token);
    expect(hashSessionToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('sets an HttpOnly, SameSite=Lax cookie for the whole site, and clears it', () => {
    expect(sessionCookieHeader('tok', 3600.7)).toBe(
      `${SESSION_COOKIE}=tok; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`
    );
    expect(clearSessionCookieHeader()).toBe(
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  });
});

describe('findLiveSession', () => {
  it('opens a session with its token and nothing else', async () => {
    const token = await sessionTokenFor(db, 'cust-aino');
    expect(await findLiveSession(db, token, NOW)).toMatchObject({ account: 'cust-aino' });
    expect(await findLiveSession(db, hashSessionToken(token), NOW)).toBeNull();
    expect(await findLiveSession(db, undefined, NOW)).toBeNull();
    expect(await findLiveSession(db, '', NOW)).toBeNull();
    expect(await findLiveSession(db, 'x'.repeat(5000), NOW)).toBeNull();
  });

  it('is over from its expiry instant on', async () => {
    const token = await sessionTokenFor(db, 'cust-aino');
    await db.session.updateMany({ data: { expires_at: '2026-11-08T10:00:00.000Z' } });
    expect(await findLiveSession(db, token, '2026-11-08T09:59:59.999Z')).not.toBeNull();
    expect(await findLiveSession(db, token, NOW)).toBeNull();
  });

  it("never lets a customer's session act as someone else, whatever its row says", async () => {
    const token = await sessionTokenFor(db, 'cust-aino', { actingAs: 'cust-mikko' });
    expect(await findLiveSession(db, token, NOW)).toMatchObject({
      account: 'cust-aino',
      actingAs: null,
    });
  });

  it('reads an account with an unknown role as no session', async () => {
    const token = await sessionTokenFor(db, 'cust-aino');
    await db.account.updateMany({ data: { role: 'superuser' } });
    expect(await findLiveSession(db, token, NOW)).toBeNull();
  });
});

describe('endSession and setDemoState', () => {
  it('sign-out deletes the row, so the token opens nothing, audited', async () => {
    const token = await sessionTokenFor(db, 'cust-aino');
    const session = (await findLiveSession(db, token, NOW))!;
    await endSession(db, session);
    expect(await findLiveSession(db, token, NOW)).toBeNull();
    expect(await db.auditLog.findFirstOrThrow()).toMatchObject({
      actor: 'cust-aino',
      action: 'session.ended',
      entity_id: session.id,
    });
  });

  it("stores the customer the admin acts as and the clock on the admin's session", async () => {
    const token = await sessionTokenFor(db, 'admin');
    const session = (await findLiveSession(db, token, NOW))!;
    expect(
      await setDemoState(db, session, { actingAs: 'cust-lena', asOf: '2027-01-01' })
    ).toMatchObject({
      actingAs: 'cust-lena',
      asOf: '2027-01-01',
    });
    expect(await findLiveSession(db, token, NOW)).toMatchObject({
      account: 'admin',
      actingAs: 'cust-lena',
      asOf: '2027-01-01',
    });
    await setDemoState(db, session, { actingAs: null });
    expect(await findLiveSession(db, token, NOW)).toMatchObject({
      actingAs: null,
      asOf: '2027-01-01',
    });
  });
});
