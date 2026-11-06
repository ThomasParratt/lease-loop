// Plausibility of the deal: quantities, down payments and terms that cannot be, amounts that
// cross a band or a question threshold, and incomes at the edge of the affordability rule.
// Every case runs on the real data pack through the harness; the open product rules (how
// many units a consumer may lease, whether an income or a revenue is believable) were decided
// on 2026-11-06 and are pinned here on the real pack (plausibility.ts, data/consumer-limits.json).
import { describe, expect, it } from 'vitest';
import type { Customer } from '@/data/schemas';
import { applyFor, customerById, quoteFor, type Application } from './fixtures';

const DAY = '2026-11-05';
const aino = customerById('cust-aino');
const kettu = customerById('cust-kettukoodi');
const norvi = customerById('cust-norvi');
/** A company with another revenue on record, so D38 does not hold the answer as a difference. */
const withRevenue = (c: Customer, cents: number): Customer =>
  c.type === 'company' ? { ...c, annual_revenue_cents: cents } : c;

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

  // the consumer limits (data/consumer-limits.json): e-bike 2, laptop 2, farm machine 1 and
  // always checked; Aino with a rich income on record (D38 compares the answer with the record),
  // so affordability never decides
  const richAino = { ...aino, monthly_net_income_cents: 5_000_000 };

  it('a consumer with a large income asking for 20 e-bikes is held: quantity_over_consumer_cap', () => {
    const app = applyFor(richAino, bikes(20));
    expect(app.ok && app.result).toEqual({
      decision: 'manual_review',
      reasons: [
        {
          code: 'quantity_over_consumer_cap',
          params: { category: 'e_bike', quantity: 20, maxQuantity: 2 },
        },
      ],
    });
  });

  it('two e-bikes or two laptops are within the cap; six laptops are held', () => {
    expect(outcome(applyFor(richAino, bikes(2)))).toBe('approved:all_checks_passed');
    expect(outcome(applyFor(richAino, laptops(2)))).toBe('approved:all_checks_passed');
    expect(outcome(applyFor(richAino, laptops(6)))).toBe(
      'manual_review:quantity_over_consumer_cap'
    );
  });

  it('a company is not capped: kettukoodi with 20 e-bikes is approved', () => {
    expect(outcome(applyFor(kettu, bikes(20)))).toBe('approved:all_checks_passed');
  });

  it('a consumer asking for a farm machine is held: category_needs_review; two hold for both', () => {
    const farm = (quantity: number) => ({
      assetId: 'farm-003',
      quantity,
      termMonths: 48,
      isoDate: DAY,
    });
    const one = applyFor(richAino, farm(1));
    expect(one.ok && one.result.reasons).toEqual([
      { code: 'category_needs_review', params: { category: 'farm_machine' } },
    ]);
    expect(outcome(applyFor(richAino, farm(2)))).toBe(
      'manual_review:quantity_over_consumer_cap+category_needs_review'
    );
  });
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
    ).toBe('manual_review:answer_differs_from_record+income_implausible');
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
    ['10000000', 'approved:all_checks_passed'],
    ['10000001', 'manual_review:income_implausible'],
    ['100000000000', 'manual_review:income_implausible'],
    ['9999999999999', 'manual_review:income_implausible'],
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

  it('an income of 1 000 000 000 cents a month is held: income_implausible with the ceiling', () => {
    const app = withIncome('1000000000');
    expect(app.ok && app.result).toEqual({
      decision: 'manual_review',
      reasons: [
        {
          code: 'income_implausible',
          params: { incomeCents: 1_000_000_000, ceilingCents: 10_000_000 },
        },
      ],
    });
  });

  it('the affordability rule runs first: an unaffordable rent is rejected, never only held', () => {
    expect(outcome(withIncome('1', bikes(20)))).toBe('rejected:unaffordable');
  });
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

  it('annual revenue below the financed amount (1 cent on 5 235 000) is held: revenue_below_financed', () => {
    const app = applyFor(withRevenue(kettu, 1), big);
    expect(app.ok && app.result).toEqual({
      decision: 'manual_review',
      reasons: [
        { code: 'revenue_below_financed', params: { revenueCents: 1, financedCents: 5_235_000 } },
      ],
    });
  });

  it('revenue equal to the financed amount passes; 0 counts as below (norvi has 410 000 000 on record)', () => {
    expect(outcome(applyFor(withRevenue(kettu, 5_235_000), big))).toBe(
      'approved:all_checks_passed'
    );
    // norvi's applicant may not sign, so the signatory is still named
    expect(outcome(applyFor(norvi, big, { answers: { q_annual_revenue: '0' } }))).toBe(
      'manual_review:answer_differs_from_record+revenue_below_financed+signatory_needed'
    );
  });

  it.each([
    [['A (60 %)', 'B (41 %)'], 'over_100'],
    [['Jussi Haapala (60 %)', 'jussi haapala (40 %)'], 'duplicate'],
  ])('owners %j are held: owners_implausible %s', (owners, reason) => {
    const app = applyFor(kettu, big, { answers: { q_beneficial_owners: owners } });
    expect(app.ok && app.result.reasons).toEqual([
      { code: 'owners_implausible', params: { reason } },
    ]);
  });

  it('owners as free text without shares stay accepted', () => {
    expect(
      outcome(applyFor(kettu, big, { answers: { q_beneficial_owners: ['The founders, equally'] } }))
    ).toBe('approved:all_checks_passed');
  });
});
