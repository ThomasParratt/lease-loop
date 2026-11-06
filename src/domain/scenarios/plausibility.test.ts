// Plausibility of the deal: quantities, down payments and terms that cannot be, amounts that
// cross a band or a question threshold, and incomes at the edge of the affordability rule.
// Every case runs on the real data pack through the harness; the open product rules (how
// many units a consumer may lease, whether an income or a revenue is believable) are todos
// with their candidate outcomes in the name, so the decision is Johannes's, not the code's.
import { describe, expect, it } from 'vitest';
import { applyFor, customerById, quoteFor, type Application } from './fixtures';

const DAY = '2026-11-05';
const aino = customerById('cust-aino');
const kettu = customerById('cust-kettukoodi');
const norvi = customerById('cust-norvi');

const bikes = (quantity: number, downPaymentCents = 0) => ({
  assetId: 'ebike-003',
  quantity,
  termMonths: 36,
  downPaymentCents,
  isoDate: DAY,
});
const laptops = (quantity: number) => ({
  assetId: 'laptop-004',
  quantity,
  termMonths: 36,
  isoDate: DAY,
});

const refusal = (deal: Parameters<typeof quoteFor>[0]) => {
  const q = quoteFor(deal);
  return q.ok ? `ok:${q.quote.band}:${q.quote.financedCents}` : q.reason.code;
};

const outcome = (app: Application) =>
  app.ok
    ? `${app.result.decision}:${app.result.reasons.map((r) => r.code).join('+')}`
    : `${app.step}:${'questionId' in app ? app.questionId : app.quote.ok ? '' : app.quote.reason.code}`;

describe('quantity', () => {
  it.each([
    [0, 'invalid_quantity'],
    [-1, 'invalid_quantity'],
    [1.5, 'invalid_quantity'],
    [Number.NaN, 'invalid_quantity'],
    ['4' as unknown as number, 'invalid_quantity'],
    [1, 'ok:B:389000'],
    [2, 'ok:B:778000'],
    [3, 'ok:C:1167000'],
    [20, 'ok:D:7780000'],
    [1000, 'above_maximum'],
  ])('%s × ebike-003 → %s', (quantity, expected) => {
    expect(refusal(bikes(quantity))).toBe(expected);
  });

  it('card 6: one ebike-004 is band B and is not asked about PEP; two cross 1 000 000 and are', () => {
    const one = applyFor(norvi, { assetId: 'ebike-004', termMonths: 36, isoDate: DAY });
    expect(one.ok && [one.context.financedCents, one.askedIds.includes('q_pep')]).toEqual([
      549_000,
      false,
    ]);
    const two = applyFor(norvi, {
      assetId: 'ebike-004',
      quantity: 2,
      termMonths: 36,
      isoDate: DAY,
    });
    expect(two.ok && [two.context.financedCents, two.askedIds.includes('q_pep')]).toEqual([
      1_098_000,
      true,
    ]);
  });

  it('14 laptop-004 stay under 5 000 000 (no revenue or owners asked); 15 cross it and both appear', () => {
    const fourteen = applyFor(kettu, laptops(14));
    expect(fourteen.ok && fourteen.askedIds).not.toContain('q_annual_revenue');
    const fifteen = applyFor(kettu, laptops(15));
    expect(fifteen.ok && [fifteen.context.financedCents, fifteen.askedIds]).toEqual([
      5_235_000,
      expect.arrayContaining(['q_annual_revenue', 'q_beneficial_owners', 'q_pep']),
    ]);
  });

  it('the thresholds are on the total, so a consumer with 15 laptops is asked PEP but never revenue', () => {
    const app = applyFor(aino, laptops(15));
    expect(app.ok && app.askedIds).toContain('q_pep');
    expect(app.ok && app.askedIds).not.toContain('q_annual_revenue');
  });

  it('a company leasing one e-bike is an ordinary approval', () => {
    expect(outcome(applyFor(kettu, bikes(1)))).toBe('approved:all_checks_passed');
  });

  it('a consumer asking for 20 e-bikes is stopped only by the budget: 257 318 a month against 320 000', () => {
    const app = applyFor(aino, bikes(20));
    expect(app.ok && app.result).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'unaffordable', params: { grossMonthlyRentCents: 257_318 } }],
    });
  });

  it.todo(
    'a consumer with a large income asking for 20 e-bikes "for commuting": today approved on affordability alone; candidates: cap consumer quantity per category (e.g. 2), manual review above a cap, allow and show the per-unit split'
  );
  it.todo(
    'a consumer asking for 6 laptops: today approved if affordable; candidates: cap at N per category, manual review, allow'
  );
  it.todo(
    'a consumer asking for a farm machine with a placeholder farm registry number: today approved if affordable; candidates: farm machines for sole traders and companies only, manual review, allow'
  );
});

describe('down payment (net cents)', () => {
  const price = 389_000;

  it.each([
    [price + 1, 'down_payment_too_high'],
    [price, 'down_payment_too_high'],
    [price - 1, 'below_minimum'],
    [price - 29_999, 'below_minimum'],
    [price - 30_000, 'ok:A:30000'],
    [-1, 'invalid_down_payment'],
    [0.5, 'invalid_down_payment'],
    [Number.POSITIVE_INFINITY, 'invalid_down_payment'],
    [0, 'ok:B:389000'],
  ])('%s on a 389 000 bike → %s', (down, expected) => {
    expect(refusal(bikes(1, down))).toBe(expected);
  });
});

describe('term', () => {
  it.each([18, 0, -12, 60, 36.5, Number.NaN])('%s months is not in the table', (termMonths) => {
    const q = quoteFor({ ...bikes(1), termMonths });
    expect(q.ok ? null : q.reason).toEqual({
      code: 'unknown_term',
      params: { termMonths, terms: [12, 24, 36, 48] },
    });
  });
});

describe('affordability: gross rent × 100 ≤ net income × 30', () => {
  // card 1: ebike-003, 36 months, 10 730 net → 13 466 gross; the income that just carries it
  // is ceil(13 466 × 100 / 30) = 44 887
  // The record carries the same income: an income other than the record holds the case for a
  // person (D38), so the rule under test is reached only with a record that agrees.
  const withIncome = (q_monthly_income: string, deal = bikes(1)) =>
    applyFor(
      /^\d+$/.test(q_monthly_income)
        ? ({ ...aino, monthly_net_income_cents: Number(q_monthly_income) } as typeof aino)
        : aino,
      deal,
      { answers: { q_monthly_income } }
    );

  it('D38: an income other than the record is held for a person, never approved', () => {
    expect(
      outcome(applyFor(aino, bikes(1), { answers: { q_monthly_income: '9999999999999' } }))
    ).toBe('manual_review:answer_differs_from_record');
  });

  it('an income of 44 887 passes exactly; 44 886 is one cent short', () => {
    expect(outcome(withIncome('44887'))).toBe('approved:all_checks_passed');
    const short = withIncome('44886');
    expect(short.ok && short.result.reasons).toEqual([
      {
        code: 'unaffordable',
        params: {
          grossMonthlyRentCents: 13_466,
          maxRentCents: 13_465,
          monthlyNetIncomeCents: 44_886,
        },
      },
    ]);
  });

  it.each([
    ['0', 'rejected:unaffordable'],
    ['00000', 'rejected:unaffordable'],
    ['1', 'rejected:unaffordable'],
    ['100000000000', 'approved:all_checks_passed'],
    ['9999999999999', 'approved:all_checks_passed'],
  ])('income %s → %s', (income, expected) => {
    expect(outcome(withIncome(income))).toBe(expected);
  });

  it.each(['-1', '3200.50', '3 200', '1e6', '99999999999999', '', 'plenty'])(
    'income %s is not a money answer (cents as digits only)',
    (income) => {
      expect(outcome(withIncome(income))).toBe('invalid:q_monthly_income');
    }
  );

  it('the income question is not asked under 200 000 financed, so the rule is not applied', () => {
    const cheap = { assetId: 'ebike-005', termMonths: 36, isoDate: DAY }; // 159 000, band A
    const app = applyFor(aino, cheap, { answers: { q_monthly_income: '0' } });
    expect(app.ok && app.askedIds).not.toContain('q_monthly_income');
    expect(outcome(app)).toBe('approved:all_checks_passed');
  });

  it.todo(
    'an income of 1 000 000 000 cents a month: today believed; candidates: manual review above a sanity ceiling, require proof above a ceiling, allow'
  );
});

describe('company answers at 5 000 000 and over', () => {
  const big = laptops(15); // 5 235 000 financed: revenue and owners asked

  it('a PEP answer needs its details before the flow completes', () => {
    expect(outcome(applyFor(kettu, big, { answers: { q_pep: 'yes' } }))).toBe(
      'incomplete:q_pep_details'
    );
  });

  it('owners: a list with a blank item is not an answer, a list of one is', () => {
    expect(outcome(applyFor(kettu, big, { answers: { q_beneficial_owners: ['A', ' '] } }))).toBe(
      'invalid:q_beneficial_owners'
    );
    expect(
      outcome(applyFor(kettu, big, { answers: { q_beneficial_owners: ['Sole owner (100 %)'] } }))
    ).toBe('approved:all_checks_passed');
  });

  it.todo(
    'annual revenue below the financed amount (revenue 1 cent, 5 235 000 financed): today approved; candidates: manual review when revenue < financed, reject, a revenue-to-rent ratio like the consumer rule'
  );
  it.todo(
    'owners whose percentages sum over 100 or repeat a name: today approved (free text); candidates: parse "(NN %)" and hold for review over 100 or on a duplicate, keep free text for a person to read'
  );
  it.todo(
    'revenue 0 for a company with 410 000 000 on record: today approved and not compared with the record; candidates: add revenue to the record check, allow (revenue changes yearly)'
  );
});
