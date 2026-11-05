// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { createTestDb } from '../../tests/helpers/test-db';
import { createApplication, decideApplication, getApplication } from './applications';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = await loadCustomers();
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, customers);
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.application.deleteMany();
  await db.quote.deleteMany();
});

const TODAY = '2026-11-05';
const answersOf = (id: string) => answersFromCustomer(customers.find((c) => c.id === id)!);

type QuoteRow = { asset: string; quantity?: number; financed: number; term: number; net: number };

/** The quote rows the pricing slice would write; the numbers are the pinned card numbers. */
async function insertQuote({ asset, quantity = 1, financed, term, net }: QuoteRow) {
  const row = await db.quote.create({
    data: {
      asset_id: asset,
      quantity,
      quote_date: TODAY,
      valid_until: '2026-12-05',
      price_list_version: 1,
      list_price_cents: financed / quantity,
      down_payment_cents: 0,
      financed_cents: financed,
      band: 'B',
      factor_millionths: 27_584,
      term_months: term,
      monthly_net_cents: net,
      buyout_cents: 0,
      vat_rate_bp_at_quote: 2_550,
    },
  });
  return row.id;
}

const card1 = () => insertQuote({ asset: 'ebike-003', financed: 389_000, term: 36, net: 10_730 });
const card5 = () => insertQuote({ asset: 'laptop-008', financed: 289_000, term: 36, net: 7_972 });
const card6 = () =>
  insertQuote({ asset: 'ebike-004', quantity: 4, financed: 2_196_000, term: 36, net: 58_993 });
const card7 = () =>
  insertQuote({ asset: 'farm-002', financed: 12_500_000, term: 48, net: 272_038 });

async function apply(quoteId: string, customerId: string, answers = answersOf(customerId)) {
  return createApplication(db, { quoteId, customerId, answers, today: TODAY, actor: customerId });
}

describe('createApplication', () => {
  it('card 1: Aino is approved, and the audit row is written with it', async () => {
    const result = await apply(await card1(), 'cust-aino');
    expect(result).toMatchObject({
      ok: true,
      application: { decision: 'approved', decidedOn: TODAY, customerId: 'cust-aino' },
    });
    if (!result.ok) return;
    const audit = await db.auditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'application.created',
      entity_id: result.application.id,
      actor: 'cust-aino',
    });
  });

  it('card 5: Mikko is rejected with too_young and the day he turns 18', async () => {
    const result = await apply(await card5(), 'cust-mikko');
    expect(result.ok && result.application).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'too_young', params: { eighteenOn: '2027-03-10' } }],
    });
  });

  it('card 6: Norvi ends in awaiting_signatory', async () => {
    const result = await apply(await card6(), 'cust-norvi');
    expect(result.ok && result.application.decision).toBe('awaiting_signatory');
  });

  it('card 7: Haapala goes to manual review with pep', async () => {
    const result = await apply(await card7(), 'cust-haapala');
    expect(result.ok && result.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'pep', params: {} }],
    });
  });

  it('the broken business id is rejected with invalid_business_id', async () => {
    const result = await apply(await card1(), 'cust-broken-id');
    expect(result.ok && result.application.reasons[0]?.code).toBe('invalid_business_id');
  });

  it('stores only the answers that apply (pruned)', async () => {
    const answers = { ...answersOf('cust-kettukoodi'), q_signatory_email: 'x@example.com' };
    const result = await apply(await card1(), 'cust-kettukoodi', answers);
    expect(result.ok && result.application.answers).not.toHaveProperty('q_signatory_email');
  });

  it('refuses an incomplete flow and names the first missing question', async () => {
    const { q_email: _dropped, ...answers } = answersOf('cust-aino');
    expect(await apply(await card1(), 'cust-aino', answers)).toEqual({
      ok: false,
      reason: 'incomplete_answers',
      questionId: 'q_email',
    });
    expect(await db.application.count()).toBe(0);
  });

  it('refuses an answer of the wrong shape', async () => {
    const answers = { ...answersOf('cust-aino'), q_country: 'Finland' };
    expect(await apply(await card1(), 'cust-aino', answers)).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_country',
    });
  });

  it('unknown quote, unknown customer and an expired quote', async () => {
    expect(await apply('nope', 'cust-aino')).toEqual({ ok: false, reason: 'quote_not_found' });
    const quoteId = await card1();
    expect(await apply(quoteId, 'cust-nobody', {})).toEqual({
      ok: false,
      reason: 'customer_not_found',
    });
    const late = await createApplication(db, {
      quoteId,
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: '2026-12-06',
      actor: 'cust-aino',
    });
    expect(late).toEqual({ ok: false, reason: 'quote_expired' });
  });
});

describe('decideApplication (D10)', () => {
  const decide = (id: string, decision: 'approved' | 'rejected', actor = 'admin') =>
    decideApplication(db, { id, decision, reviewedBy: actor, today: '2026-11-06', actor });

  it('card 7: an admin approves the manual review; the reason and the reviewer are kept', async () => {
    const created = await apply(await card7(), 'cust-haapala');
    if (!created.ok) throw new Error('setup');
    const result = await decide(created.application.id, 'approved');
    expect(result.ok && result.application).toMatchObject({
      decision: 'approved',
      reviewedBy: 'admin',
      decidedOn: '2026-11-06',
      reasons: [
        { code: 'pep', params: {} },
        { code: 'reviewed', params: { by: 'admin', decision: 'approved', on: '2026-11-06' } },
      ],
    });
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(1);
  });

  it('only an admin decides a manual review', async () => {
    const created = await apply(await card7(), 'cust-haapala');
    if (!created.ok) throw new Error('setup');
    expect(await decide(created.application.id, 'approved', 'cust-haapala')).toEqual({
      ok: false,
      reason: 'admin_only',
    });
  });

  it('card 6: the named signatory signs and the application is approved', async () => {
    const created = await apply(await card6(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    const result = await decideApplication(db, {
      id: created.application.id,
      decision: 'approved',
      reviewedBy: 'signatory@norvi.example.com',
      today: TODAY,
      actor: 'cust-norvi',
    });
    expect(result.ok && result.application.decision).toBe('approved');
    expect(result.ok && result.application.reasons.at(-1)?.code).toBe('signatory_decided');
  });

  it('a PEP case that also needs a signatory waits for the signatory after the review', async () => {
    const answers = {
      ...answersOf('cust-haapala'),
      q_can_sign: 'no',
      q_signatory_email: 'jussi@haapala.example.com',
    };
    const created = await apply(await card7(), 'cust-haapala', answers);
    if (!created.ok) throw new Error('setup');
    expect(created.application.decision).toBe('manual_review');
    const result = await decide(created.application.id, 'approved');
    expect(result.ok && result.application.decision).toBe('awaiting_signatory');
  });

  it('a decided application is final; an unknown id is not found', async () => {
    const created = await apply(await card1(), 'cust-aino');
    if (!created.ok) throw new Error('setup');
    expect(await decide(created.application.id, 'rejected')).toEqual({
      ok: false,
      reason: 'not_pending',
    });
    expect(await decide('nope', 'approved')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('getApplication', () => {
  it('returns the view or null', async () => {
    const created = await apply(await card1(), 'cust-aino');
    if (!created.ok) throw new Error('setup');
    expect(await getApplication(db, created.application.id)).toEqual(created.application);
    expect(await getApplication(db, 'nope')).toBeNull();
  });
});
