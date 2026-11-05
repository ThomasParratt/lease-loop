// Signing on a real migrated SQLite database: the contract, the invoices, the passport entry,
// the leased asset and the audit row commit together, and every refusal writes nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PricingData } from '@/domain/pricing';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { listAssetEvents } from './asset-events';
import { getAsset } from './assets';
import { withAudit } from './audit';
import { AssetNotAvailableError, leaseAvailableAsset } from './catalogue-handlers';
import { contractCustomerId, getContract, getContractDetails, signContract } from './contracts';
import { listInvoices } from './invoices';
import type { PrismaClient } from './prisma-client';
import { createQuote, loadPricingData } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: PricingData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedPack(db);
  data = await loadPricingData();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.invoice.deleteMany();
  await db.assetEvent.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.quote.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.updateMany({ where: { status: 'leased' }, data: { status: 'available' } });
});

type QuoteTerms = { assetId: string; termMonths: number; downPaymentCents: number; today: string };

const CARD_1: QuoteTerms = {
  assetId: 'ebike-003',
  termMonths: 36,
  downPaymentCents: 0,
  today: '2026-11-05',
};

/** A stored quote (through pricing) and an application with `decision` for `cust-aino`. */
async function application(terms: QuoteTerms = CARD_1, decision = 'approved'): Promise<string> {
  const quote = await createQuote(db, { ...terms, quantity: 1, actor: 'cust-aino' }, data);
  if (!quote.ok) throw new Error(quote.reason.code);
  // The application slice's write, done directly: these tests are about signing.
  const row = await db.application.create({
    data: {
      customer_id: 'cust-aino',
      quote_id: quote.quote.id,
      answers_json: '{}',
      decision,
      reasons_json: '[]',
      decided_on: terms.today,
    },
  });
  return row.id;
}

async function writesSoFar() {
  return {
    contracts: await db.contract.count(),
    invoices: await db.invoice.count(),
    passport: await db.assetEvent.count(),
    audit: await db.auditLog.count({ where: { action: 'contract.signed' } }),
  };
}

describe('signContract, card 1 (the happy path)', () => {
  it('signs ebike-003 on 5 Nov 2026 and writes the contract, invoices, passport, asset and audit at once', async () => {
    const applicationId = await application();
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);

    const { contract } = result.details;
    expect(contract).toMatchObject({
      applicationId,
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      quantity: 1,
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      endDate: '2029-11-04',
      monthlyNetCents: 10_730,
      buyoutCents: 58_350,
      band: 'B',
      priceListVersion: 1,
      status: 'active',
    });
    expect(result.details.priceLock).toBeNull();

    const invoices = await listInvoices(db, contract.id);
    expect(invoices).toHaveLength(36);
    expect(invoices[0]).toMatchObject({ sequence: 1, dueDate: '2026-11-05', grossCents: 13_466 });
    expect(invoices[2]).toMatchObject({ issueDate: '2027-01-05', grossCents: 13_520 });

    expect(await listAssetEvents(db, 'ebike-003')).toEqual([
      expect.objectContaining({ kind: 'leased', contract_id: contract.id, on_date: '2026-11-05' }),
    ]);
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('leased');

    const audit = await db.auditLog.findMany({ where: { action: 'contract.signed' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: 'cust-aino', entity_id: contract.id });
  });

  it('issues the down payment as invoice 0 on the signing day before a later start (D5, D7)', async () => {
    const applicationId = await application({ ...CARD_1, downPaymentCents: 50_000 });
    const result = await signContract(
      db,
      { applicationId, startDate: '2026-11-15', actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.details.contract).toMatchObject({
      signedOn: '2026-11-05',
      startDate: '2026-11-15',
      endDate: '2029-11-14',
      downPaymentCents: 50_000,
    });
    const [first, second] = await listInvoices(db, result.details.contract.id);
    expect(first).toMatchObject({ sequence: 0, kind: 'down_payment', issueDate: '2026-11-05' });
    expect(second).toMatchObject({ sequence: 1, kind: 'rent', dueDate: '2026-11-15' });
  });

  it('lets admin sign for the customer, and the audit row names admin', async () => {
    const applicationId = await application();
    const result = await signContract(db, { applicationId, actor: 'admin' }, '2026-11-05', data);
    expect(result.ok).toBe(true);
    expect(await db.auditLog.findFirst({ where: { action: 'contract.signed' } })).toMatchObject({
      actor: 'admin',
    });
  });
});

describe('signContract, card 2 (the price lock)', () => {
  it('a laptop-004 quote of Thu 5 Nov signed Fri 6 Nov on v2 keeps 9 627 and says why', async () => {
    const applicationId = await application({
      assetId: 'laptop-004',
      termMonths: 36,
      downPaymentCents: 0,
      today: '2026-11-05',
    });
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-06',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.details.contract).toMatchObject({
      unitListPriceCents: 349_000,
      monthlyNetCents: 9627,
      priceListVersion: 1,
    });
    expect(result.details.quoteDate).toBe('2026-11-05');
    expect(result.details.priceLock).toEqual({
      code: 'price_locked_from_quote',
      params: {
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        currentPriceListVersion: 2,
        currentMonthlyNetCents: 8857,
      },
    });
    const [first] = await listInvoices(db, result.details.contract.id);
    expect(first?.netCents).toBe(9627);

    const read = await getContractDetails(db, result.details.contract.id, '2026-11-06', data);
    expect(read).toEqual(result.details);
  });
});

describe('signContract, the last-unit race', () => {
  it('two approved applications for the same asset: the second is refused and writes nothing', async () => {
    const first = await application();
    const second = await application();
    expect(
      (await signContract(db, { applicationId: first, actor: 'cust-aino' }, '2026-11-05', data)).ok
    ).toBe(true);
    const before = await writesSoFar();

    expect(
      await signContract(db, { applicationId: second, actor: 'cust-aino' }, '2026-11-05', data)
    ).toEqual({ ok: false, reason: { code: 'asset_not_available', params: { status: 'leased' } } });
    expect(await writesSoFar()).toEqual(before);
    expect(await db.contract.findUnique({ where: { application_id: second } })).toBeNull();
  });

  it('two signings at the same instant: exactly one wins, the other is asset_not_available', async () => {
    const [first, second] = [await application(), await application()];
    const results = await Promise.all(
      [first, second].map((applicationId) =>
        signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      reason: { code: 'asset_not_available', params: { status: 'leased' } },
    });
    expect(await writesSoFar()).toEqual({ contracts: 1, invoices: 36, passport: 1, audit: 1 });
  });

  it('the conditional write throws on an asset that is no longer available, rolling back the audit row', async () => {
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status: 'leased' } });
    await expect(
      withAudit(
        db,
        { actor: 'test', action: 'contract.signed', entityType: 'contract', entityId: 'x' },
        (tx) => leaseAvailableAsset(tx, 'ebike-003')
      )
    ).rejects.toBeInstanceOf(AssetNotAvailableError);
    expect(await db.auditLog.count()).toBe(0);
  });
});

describe('signContract refusals write nothing', () => {
  it('already_signed on a second signing of the same application', async () => {
    const applicationId = await application();
    await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data);
    const before = await writesSoFar();
    expect(
      await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
    ).toEqual({ ok: false, reason: { code: 'already_signed', params: { applicationId } } });
    expect(await writesSoFar()).toEqual(before);
  });

  it('not_allowed_to_sign for another customer or anonymous', async () => {
    const applicationId = await application();
    for (const actor of ['cust-mikko', 'anonymous']) {
      expect(await signContract(db, { applicationId, actor }, '2026-11-05', data)).toEqual({
        ok: false,
        reason: { code: 'not_allowed_to_sign', params: { applicationId } },
      });
    }
    expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
  });

  it('application_not_found for an unknown id', async () => {
    expect(
      await signContract(db, { applicationId: 'nope', actor: 'admin' }, '2026-11-05', data)
    ).toEqual({
      ok: false,
      reason: { code: 'application_not_found', params: { applicationId: 'nope' } },
    });
  });

  it.each(['rejected', 'manual_review', 'awaiting_signatory'])(
    'application_not_approved when the decision is %s',
    async (decision) => {
      const applicationId = await application(CARD_1, decision);
      expect(
        await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
      ).toEqual({ ok: false, reason: { code: 'application_not_approved', params: { decision } } });
      expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
      expect((await getAsset(db, 'ebike-003'))?.status).toBe('available');
    }
  );

  it('quote_expired after the 14 days, start_too_far past 90 days', async () => {
    const applicationId = await application();
    expect(
      await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-20', data)
    ).toEqual({
      ok: false,
      reason: { code: 'quote_expired', params: { validUntil: '2026-11-19' } },
    });
    const far = await signContract(
      db,
      { applicationId, startDate: '2027-03-01', actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    expect(far.ok || far.reason.code).toBe('start_too_far');
    expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
  });
});

describe('the owner reads', () => {
  it('getContract and contractCustomerId read a signed contract, null for an unknown id', async () => {
    const applicationId = await application();
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    const { id } = result.details.contract;
    expect(await getContract(db, id)).toEqual(result.details.contract);
    expect(await contractCustomerId(db, id)).toBe('cust-aino');
    expect(await getContract(db, 'nope')).toBeNull();
    expect(await contractCustomerId(db, 'nope')).toBeNull();
  });
});

describe('getContractDetails', () => {
  it('is null for an unknown contract', async () => {
    expect(await getContractDetails(db, 'nope', '2026-11-05', data)).toBeNull();
  });
});
