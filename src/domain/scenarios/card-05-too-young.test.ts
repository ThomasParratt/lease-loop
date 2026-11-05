// Card 5, too young: Mikko (born 10 Mar 2009) applies for `laptop-008`. He is 17 on the start
// date; the decision is a code with the day he turns 18, so the page can say when to apply.
// Without the age rule, his income would carry the rent at 36 and 48 months.
import { describe, expect, it } from 'vitest';
import { eligibilityInputFromAnswers, grossFromNetCents } from '../question-flow/answers';
import { evaluate } from '../question-flow/eligibility';
import { applyFor, customerById, financedLimits, pack, quoteFor } from './fixtures';

const mikko = customerById('cust-mikko');
const deal = (termMonths: number, isoDate = '2026-11-05') => ({
  assetId: 'laptop-008',
  termMonths,
  isoDate,
});

describe('card 5: too young (Mikko, laptop-008)', () => {
  it('is rejected on 5 Nov 2026 with too_young and the day he turns 18, 10 Mar 2027', () => {
    const app = applyFor(mikko, deal(36));
    expect(app.ok && app.result).toEqual({
      decision: 'rejected',
      reasons: [
        { code: 'too_young', params: { birthDate: '2009-03-10', eighteenOn: '2027-03-10' } },
      ],
    });
  });

  it('is still too young on 9 Mar 2027 and approved on his birthday, 10 Mar 2027', () => {
    const before = applyFor(mikko, deal(36, '2027-03-09'));
    expect(before.ok && before.result.decision).toBe('rejected');
    const on = applyFor(mikko, deal(36, '2027-03-10'));
    expect(on.ok && on.result.decision).toBe('approved');
  });

  it('is asked his income, because 289 000 financed is 200 000 or more', () => {
    const app = applyFor(mikko, deal(36));
    expect(app.ok && app.askedIds).toContain('q_monthly_income');
  });

  it.each([
    [12, 15_837, 19_875, 'rejected'],
    [24, 10_269, 12_888, 'rejected'],
    [36, 7_972, 10_005, 'approved'],
    [48, 6_631, 8_322, 'approved'],
  ])(
    'without the age rule, %i months (net %i, gross %i against 12 000 = 30 % of 400 €) is %s',
    (term, net, gross, decision) => {
      const app = applyFor(mikko, deal(term));
      const q = quoteFor(deal(term));
      if (!app.ok || !q.ok) throw new Error('the flow did not complete');
      const grossMonthlyRentCents = grossFromNetCents(
        q.quote.monthlyNetCents,
        q.quote.vatRateBasisPoints
      );
      expect(q.quote.monthlyNetCents).toBe(net);
      expect(grossMonthlyRentCents).toBe(gross);
      const withoutAge = pack.questions.eligibility_rules.filter((rule) => rule.id !== 'min_age');
      const result = evaluate(
        withoutAge,
        eligibilityInputFromAnswers({
          context: app.context,
          answers: app.answers,
          startDate: '2026-11-05',
          grossMonthlyRentCents,
          financedLimits,
        })
      );
      expect(result.decision).toBe(decision);
      if (decision === 'rejected') {
        expect(result.reasons).toEqual([
          {
            code: 'unaffordable',
            params: { grossMonthlyRentCents, maxRentCents: 12_000, monthlyNetIncomeCents: 40_000 },
          },
        ]);
      }
    }
  );
});
