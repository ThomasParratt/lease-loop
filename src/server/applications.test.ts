// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { createTestDb } from '../../tests/helpers/test-db';
import { createApplication, decideApplication, flowSetupFor, getApplication } from './applications';
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

/** The quote rows the pricing slice would write; the numbers are the pinned card numbers.
 * The fixture writes the row; the code under test reads it only through pricing's `getQuote`. */
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

describe('flowSetupFor', () => {
  it('reads the frozen quote numbers through the pricing slice (one owner per table)', async () => {
    const found = await flowSetupFor(db, await card6(), 'cust-norvi');
    expect(found).toMatchObject({
      ok: true,
      setup: {
        context: { category: 'e_bike', financedCents: 2_196_000, termMonths: 36 },
        quoteValidUntil: '2026-12-05',
      },
      quote: { monthlyNetCents: 58_993, vatRateBp: 2_550 },
    });
  });
});

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

  it('the trap: a birth date in the future is an invalid answer, not too_young', async () => {
    const answers = { ...answersOf('cust-mikko'), q_birth_date: '2030-01-01' };
    expect(await apply(await card5(), 'cust-mikko', answers)).toEqual({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_birth_date',
      problem: {
        code: 'birth_date_out_of_range',
        params: { earliest: '1906-11-05', latest: TODAY },
      },
    });
    expect(await db.application.count()).toBe(0);
  });

  it('the trap: card 5 Mikko answering "company" goes to manual review, not approved', async () => {
    const answers = {
      q_customer_type: 'company',
      q_email: 'mikko.laine@example.com',
      q_business_id: '0737546-2',
      q_company_name: 'Mikko Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'no',
    };
    const result = await apply(await card5(), 'cust-mikko', answers);
    expect(result.ok && result.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'answer_differs_from_record', params: { question: 'q_customer_type' } }],
    });
  });

  it('card 6: the applicant cannot name themself as the signatory', async () => {
    const answers = { ...answersOf('cust-norvi'), q_signatory_email: 'FLEET@norvi.example.com' };
    expect(await apply(await card6(), 'cust-norvi', answers)).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_signatory_email',
      problem: { code: 'signatory_is_applicant' },
    });
  });

  it('the trap: card 5 Mikko cannot apply in Aino’s name with her answers (D40)', async () => {
    const result = await createApplication(db, {
      quoteId: await card5(),
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: TODAY,
      actor: 'cust-mikko',
    });
    expect(result).toEqual({ ok: false, reason: 'not_applicant' });
    for (const actor of ['admin', 'anonymous']) {
      const other = await createApplication(db, {
        quoteId: await card1(),
        customerId: 'cust-aino',
        answers: answersOf('cust-aino'),
        today: TODAY,
        actor,
      });
      expect(other, actor).toEqual({ ok: false, reason: 'not_applicant' });
    }
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
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

  it('the trap: card 6 cannot be signed by a name other than the named signatory', async () => {
    const created = await apply(await card6(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    const sign = (reviewedBy: string, actor: string) =>
      decideApplication(db, {
        id: created.application.id,
        decision: 'approved',
        reviewedBy,
        today: TODAY,
        actor,
      });
    expect(await sign('fleet@norvi.example.com', 'cust-norvi')).toEqual({
      ok: false,
      reason: 'not_signatory',
    });
    expect(await sign('signatory@norvi.example.com', 'cust-aino')).toEqual({
      ok: false,
      reason: 'not_signatory',
    });
    expect(await sign('signatory@norvi.example.com', 'admin')).toEqual({
      ok: false,
      reason: 'not_signatory',
    });
    expect((await getApplication(db, created.application.id))?.decision).toBe('awaiting_signatory');
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(0);
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
    const signed = await decideApplication(db, {
      id: created.application.id,
      decision: 'approved',
      reviewedBy: 'jussi@haapala.example.com',
      today: TODAY,
      actor: 'cust-haapala',
    });
    expect(signed.ok && signed.application.decision).toBe('approved');
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

  it('two decisions at the same instant: exactly one wins, the other is not_pending and writes nothing', async () => {
    const created = await apply(await card7(), 'cust-haapala');
    if (!created.ok) throw new Error('setup');
    const id = created.application.id;
    const results = await Promise.all([decide(id, 'approved'), decide(id, 'rejected')]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'not_pending' });
    const winner = results.find((r) => r.ok);
    const stored = await getApplication(db, id);
    expect(stored?.decision).toBe(winner?.ok && winner.application.decision);
    expect(stored?.reasons.filter((r) => r.code === 'reviewed')).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(1);
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
