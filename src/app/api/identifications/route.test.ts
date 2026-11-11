// The bank identification flow end to end through the real routes (D95 to D97), on a real,
// migrated SQLite database: start → the Test Bank → our callback → a session, or a signature.
// Only `db` and the browser's cookies are replaced; the cookie map plays the browser.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../../tests/helpers/invoice-fixture';
import { quoteAndApply } from '../../../../tests/helpers/journey';
import { resetDb } from '../../../../tests/helpers/reset-db';
import { SESSION_COOKIE } from '../../../../tests/helpers/sessions';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { loadCustomers } from '@/data/load';
import { seedAccounts } from '@/server/accounts';
import { identityHash } from '@/server/identity-hash';
import { IDENTIFICATION_COOKIE } from '@/server/identifications';
import type { PrismaClient } from '@/server/prisma-client';
import { testPeople } from '@/server/test-bank';
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

const start = await import('./route');
const callback = await import('./callback/route');
const testBank = await import('../test-bank/authorize/route');
const contracts = await import('../contracts/route');
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
  const pack = await loadCustomers();
  const codes = new Map(testPeople(pack).map((p) => [p.customerId, p.personalCode]));
  // Aino, Mikko and Kettu Koodi have accounts; Lena has none.
  await seedAccounts(
    holder.db,
    pack.filter((c) => ['cust-aino', 'cust-mikko', 'cust-kettukoodi'].includes(c.id)),
    {
      adminEmail: 'admin@lease-loop.test',
      adminPassword: 'admin-password-for-tests',
      customerPassword: 'company-password-for-tests',
      identityOf: (id) => (codes.has(id) ? identityHash(codes.get(id)!) : null),
    }
  );
  holder.cookies = new Map();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const json = (url: string, body: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Keeps the cookies a response sets, as a browser would (an empty value deletes). */
function keepCookies(response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const [name, value] = pair!.split('=');
    if (value) holder.cookies.set(name!, value);
    else holder.cookies.delete(name!);
  }
}

/** POST /api/identifications; keeps the state cookie; answers the Test Bank's state and nonce. */
async function startIdentification(body: Record<string, unknown>) {
  const response = await start.POST(
    json('/api/identifications', { locale: 'en', ...body }),
    undefined
  );
  const answer = await response.json();
  if (!response.ok) return { status: response.status, answer, state: '', nonce: '' };
  keepCookies(response);
  const url = new URL(answer.data.redirectTo, 'http://localhost:3000');
  return {
    status: response.status,
    answer,
    state: url.searchParams.get('state')!,
    nonce: url.searchParams.get('nonce')!,
  };
}

/** The person picks `customerId` at the Test Bank; answers our callback URL. */
async function pickAtTestBank(state: string, nonce: string, customerId?: string) {
  const response = await testBank.POST(
    json(
      '/api/test-bank/authorize',
      customerId ? { state, nonce, customerId } : { state, nonce, cancel: true }
    ),
    undefined
  );
  const answer = await response.json();
  return { status: response.status, redirectTo: answer.data?.redirectTo as string };
}

/** The browser follows the callback URL; answers where it is sent next. */
async function followCallback(redirectTo: string) {
  const response = await callback.GET(new Request(`http://localhost:3000${redirectTo}`), undefined);
  keepCookies(response);
  return { status: response.status, location: response.headers.get('location')! };
}

async function identify(body: Record<string, unknown>, customerId: string) {
  const { state, nonce } = await startIdentification(body);
  const { redirectTo } = await pickAtTestBank(state, nonce, customerId);
  return followCallback(redirectTo);
}

describe('signing in with the bank (D95)', { timeout: 30_000 }, () => {
  it('signs Aino in: the Test Bank, the callback, a session cookie, then the page she came from', async () => {
    const back = await identify({ purpose: 'sign_in', next: '/en/leases' }, 'cust-aino');
    expect(back).toEqual({ status: 303, location: '/en/leases' });
    expect(holder.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(holder.cookies.has(IDENTIFICATION_COOKIE)).toBe(false);
    expect(await readActor(holder.db)).toBe('cust-aino');
    const actions = (await holder.db.auditLog.findMany({ orderBy: { id: 'asc' } })).map(
      (r) => r.action
    );
    expect(actions).toEqual([
      'identification.started',
      'identification.completed',
      'session.created',
    ]);
  });

  it('never stores or logs the personal identity code', async () => {
    await identify({ purpose: 'sign_in' }, 'cust-aino');
    const code = testPeople(await loadCustomers()).find(
      (p) => p.customerId === 'cust-aino'
    )!.personalCode;
    const everything = JSON.stringify([
      await holder.db.auditLog.findMany(),
      await holder.db.identification.findMany(),
      await holder.db.account.findMany(),
    ]);
    expect(everything).not.toContain(code);
    expect(everything).not.toContain(code.replace('-', ''));
  });

  it('refuses the callback in another browser (no state cookie): no session', async () => {
    const { state, nonce } = await startIdentification({ purpose: 'sign_in' });
    const { redirectTo } = await pickAtTestBank(state, nonce, 'cust-aino');
    holder.cookies = new Map();
    const back = await followCallback(redirectTo);
    expect(back.location).toBe('/en/login?identificationError=identification_other_browser');
    expect(await readActor(holder.db)).toBe('anonymous');
  });

  it('refuses a replayed callback and a code given for another nonce', async () => {
    const { state, nonce } = await startIdentification({ purpose: 'sign_in' });
    const { redirectTo } = await pickAtTestBank(state, nonce, 'cust-aino');
    const cookies = new Map(holder.cookies);
    await followCallback(redirectTo);
    holder.cookies = cookies;
    expect((await followCallback(redirectTo)).location).toMatch(
      /identificationError=identification_already_completed/
    );

    const other = await startIdentification({ purpose: 'sign_in' });
    const forged = await pickAtTestBank(other.state, 'not-the-nonce', 'cust-aino');
    expect((await followCallback(forged.redirectTo)).location).toMatch(
      /identificationError=identification_failed/
    );
  });

  it('refuses an expired request, a cancelled one, and a person with no account', async () => {
    const late = await startIdentification({ purpose: 'sign_in' });
    await holder.db.identification.updateMany({ data: { expires_at: '2000-01-01T00:00:00.000Z' } });
    const lateBack = await pickAtTestBank(late.state, late.nonce, 'cust-aino');
    expect((await followCallback(lateBack.redirectTo)).location).toMatch(/identification_expired/);

    const cancelled = await startIdentification({ purpose: 'sign_in' });
    const cancel = await pickAtTestBank(cancelled.state, cancelled.nonce);
    expect((await followCallback(cancel.redirectTo)).location).toMatch(/identification_failed/);

    expect((await identify({ purpose: 'sign_in' }, 'cust-lena')).location).toBe(
      '/en/login?identificationError=no_account'
    );
    expect(await readActor(holder.db)).toBe('anonymous');
  });

  it('offers no company at the Test Bank, and sends a foreign next back to the catalogue', async () => {
    const { state, nonce } = await startIdentification({
      purpose: 'sign_in',
      next: 'https://evil.example',
    });
    expect((await pickAtTestBank(state, nonce, 'cust-kettukoodi')).status).toBe(404);
    const back = await identify({ purpose: 'sign_in', next: '//evil.example' }, 'cust-mikko');
    expect(back.location).toBe('/en/catalogue');
  });

  it('answers 404 everywhere while the demo tools are off (D97)', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    expect((await startIdentification({ purpose: 'sign_in' })).status).toBe(404);
    expect((await pickAtTestBank('s', 'n', 'cust-aino')).status).toBe(404);
  });
});

describe('identifying again to sign a contract (D96)', { timeout: 30_000 }, () => {
  async function approvedApplicationOfAino() {
    await identify({ purpose: 'sign_in' }, 'cust-aino');
    const trip = {
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      termMonths: 36,
      quoteOn: todayIso(),
    };
    return (await quoteAndApply(holder.db, trip)).application.id;
  }
  const sign = async (body: Record<string, unknown>) => {
    const response = await contracts.POST(json('/api/contracts', body), undefined);
    return { status: response.status, body: await response.json() };
  };

  it('refuses a person who signs without identifying, with the reason', async () => {
    const applicationId = await approvedApplicationOfAino();
    const refused = await sign({ applicationId });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({
      code: 'IDENTIFICATION_REQUIRED',
      details: { code: 'identification_required' },
    });
  });

  it('signs with her own fresh identification, records it, and refuses to use it twice', async () => {
    const applicationId = await approvedApplicationOfAino();
    const next = `/en/applications/${applicationId}`;
    const back = await identify({ purpose: 'sign_contract', applicationId, next }, 'cust-aino');
    expect(back.location).toMatch(new RegExp(`^${next}\\?identification=idn-`));
    const identificationId = new URL(back.location, 'http://x').searchParams.get('identification')!;

    const signed = await sign({ applicationId, identificationId });
    expect(signed.status).toBe(201);
    const row = await holder.db.auditLog.findFirstOrThrow({ where: { action: 'contract.signed' } });
    expect(JSON.parse(row.details_json!).identification).toMatchObject({
      id: identificationId,
      method: 'test_bank',
      transactionId: expect.stringMatching(/^test-/),
    });
    expect(
      (await holder.db.identification.findUniqueOrThrow({ where: { id: identificationId } }))
        .used_at
    ).not.toBeNull();
  });

  it("refuses an identification of someone else: Aino's browser identified as Mikko", async () => {
    const applicationId = await approvedApplicationOfAino();
    const back = await identify({ purpose: 'sign_contract', applicationId }, 'cust-mikko');
    const identificationId = new URL(back.location, 'http://x').searchParams.get('identification')!;
    const refused = await sign({ applicationId, identificationId });
    expect(refused.status).toBe(403);
    expect(refused.body.error.details).toMatchObject({ code: 'identification_other_person' });
    expect(await holder.db.contract.count()).toBe(0);
  });

  it("refuses a sign-in identification as a signature, and starting one for another's application", async () => {
    const applicationId = await approvedApplicationOfAino();
    const signIn = await holder.db.identification.findFirstOrThrow({
      where: { purpose: 'sign_in' },
    });
    expect(
      (await sign({ applicationId, identificationId: signIn.id })).body.error.details
    ).toMatchObject({
      code: 'identification_other_purpose',
    });
    holder.cookies = new Map();
    await identify({ purpose: 'sign_in' }, 'cust-mikko');
    expect((await startIdentification({ purpose: 'sign_contract', applicationId })).status).toBe(
      403
    );
  });
});
