// matchDemand (D13, D61): who on the waiting list gets a returned item, at what condition and
// rent, every step named.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import {
  refurbishmentCostsSchema,
  residualCurvesSchema,
  type SecondLifeRequest,
} from '@/data/schemas';
import { pack, pricing } from '../scenarios/fixtures';
import { assessReturn, type AssessData, type AssessInput } from './assess';
import { matchDemand } from './match';

const data: AssessData = {
  curves: residualCurvesSchema.parse(residualJson),
  costs: refurbishmentCostsSchema.parse(refurbishmentJson),
  pricing,
};
const ebike007: AssessInput = {
  assetId: 'ebike-007',
  category: 'e_bike',
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
  age: { modelYear: 2023, previousLives: 1, leaseStart: '2023-01-01' },
  newPriceCents: 549_000,
  isoDate: '2026-11-06',
};
const assessed = assessReturn(ebike007, data);

const entry = (over: Partial<SecondLifeRequest> & { id: string }): SecondLifeRequest => ({
  category: 'e_bike',
  max_monthly_net_rent_cents: 9_000,
  min_condition: 'fair',
  preferred_term_months: 12,
  needed_by: '2026-11-10',
  who: 'test',
  ...over,
});

describe('matchDemand on the pack (card 9)', () => {
  const match = matchDemand(assessed, pack.demand);
  const verdict = (id: string) => match.verdicts.find((v) => v.demandId === id)!;

  it('wait-02 is matched as returned: fair is enough, 8 710 a month for 12 months', () => {
    expect(verdict('wait-02').outcome).toEqual({
      code: 'candidate',
      params: {
        condition: 'fair',
        upgrade: false,
        termMonths: 12,
        monthlyNetCents: 8_710,
        maxMonthlyNetCents: 9_000,
        totalRentCents: 104_520,
      },
    });
  });

  it('wait-13 is matched only refurbished to good: 7 219 a month for 24 months', () => {
    expect(verdict('wait-13').outcome).toEqual({
      code: 'candidate',
      params: {
        condition: 'good',
        upgrade: true,
        termMonths: 24,
        monthlyNetCents: 7_219,
        maxMonthlyNetCents: 9_000,
        totalRentCents: 173_256,
      },
    });
  });

  it('names the failing step of every other entry', () => {
    expect(verdict('wait-01').outcome).toMatchObject({
      code: 'over_budget',
      params: { monthlyNetCents: 7_219, maxMonthlyNetCents: 4_500, shortCents: 2_719 },
    });
    // D83: like new is 229 004 (band B), 6 317 for 36 months, 317 over wait-03's 6 000.
    expect(verdict('wait-03').outcome).toMatchObject({
      code: 'over_budget',
      params: { condition: 'like_new', termMonths: 36, monthlyNetCents: 6_317, shortCents: 317 },
    });
    expect(verdict('wait-05').outcome.code).toBe('over_budget');
    expect(verdict('wait-06').outcome).toEqual({
      code: 'other_category',
      params: { category: 'laptop' },
    });
  });

  it('ranks wait-02 over wait-13 by the first step: no refurbishment beyond the mandatory', () => {
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['wait-02', null],
      ['wait-13', 'no_refurbishment'],
      ['wait-04', 'needed_by'],
    ]);
    expect(match.winner?.demandId).toBe('wait-02');
  });

  it('decides not to refurbish beyond the mandatory steps: relisted fair at 155 476', () => {
    expect(match.decision).toEqual({
      code: 'relist_for_winner',
      params: { condition: 'fair', upgrade: false, demandId: 'wait-02' },
    });
    expect(match.relist.secondLifeFinancedCents).toBe(155_476);
  });

  it('without wait-02 the item is refurbished to good for wait-13 (earliest need)', () => {
    const match2 = matchDemand(
      assessed,
      pack.demand.filter((d) => d.id !== 'wait-02')
    );
    expect(match2.winner?.demandId).toBe('wait-13');
    expect(match2.ranking[1]).toMatchObject({ demandId: 'wait-04', decidedBy: 'needed_by' });
    expect(match2.decision.params).toMatchObject({ condition: 'good', upgrade: true });
  });
});

describe('matchDemand on other data', () => {
  it('a category with no demand relists at the floor, good (D61), with no winner', () => {
    const match = matchDemand(
      assessed,
      pack.demand.filter((d) => d.category !== 'e_bike')
    );
    expect(match.winner).toBeNull();
    expect(match.ranking).toEqual([]);
    expect(match.decision).toEqual({
      code: 'relist_without_match',
      params: { condition: 'good', upgrade: true },
    });
    expect(match.relist.condition).toBe('good');
  });

  it('a budget one cent short is out, by one cent', () => {
    const match = matchDemand(assessed, [entry({ id: 'a', max_monthly_net_rent_cents: 8_709 })]);
    expect(match.verdicts[0]!.outcome).toMatchObject({
      code: 'over_budget',
      params: { shortCents: 1 },
    });
    const exact = matchDemand(assessed, [entry({ id: 'a', max_monthly_net_rent_cents: 8_710 })]);
    expect(exact.winner?.demandId).toBe('a');
  });

  it('two entries equal on every step but id: the lower id wins, and the step says so', () => {
    const match = matchDemand(assessed, [entry({ id: 'w-b' }), entry({ id: 'w-a' })]);
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['w-a', null],
      ['w-b', 'id'],
    ]);
  });

  it('ids compare by their numbers: wait-14 before wait-100 (review finding 12)', () => {
    const match = matchDemand(assessed, [entry({ id: 'wait-100' }), entry({ id: 'wait-14' })]);
    expect(match.ranking.map((r) => r.demandId)).toEqual(['wait-14', 'wait-100']);
  });

  it('on equal need dates the higher total rent over the term wins', () => {
    const match = matchDemand(assessed, [
      entry({ id: 'w-a', preferred_term_months: 12 }),
      entry({ id: 'w-b', preferred_term_months: 24 }),
    ]);
    // 24 × 5 696 = 136 704 beats 12 × 8 710 = 104 520.
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['w-b', null],
      ['w-a', 'total_rent'],
    ]);
  });

  it('another demand list: the earliest need wins among the as-returned candidates', () => {
    const match = matchDemand(assessed, [
      entry({ id: 'w-a', needed_by: '2026-12-01' }),
      entry({ id: 'w-b', needed_by: '2026-11-20' }),
    ]);
    expect(match.winner?.demandId).toBe('w-b');
    expect(match.ranking[1]!.decidedBy).toBe('needed_by');
  });

  it('a term the category does not offer is named', () => {
    const match = matchDemand(assessed, [entry({ id: 'w', preferred_term_months: 60 })]);
    expect(match.verdicts[0]!.outcome).toEqual({
      code: 'term_not_offered',
      params: { termMonths: 60, terms: [12, 24, 36, 48] },
    });
  });

  it('a poor item is never relisted poor: a fair-accepting entry gets it refurbished to fair', () => {
    const poor = assessReturn({ ...ebike007, condition: 'poor' }, data);
    const match = matchDemand(poor, [
      entry({ id: 'w', min_condition: 'poor', max_monthly_net_rent_cents: 99_999 }),
    ]);
    expect(match.verdicts[0]!.outcome.params).toMatchObject({ condition: 'fair', upgrade: true });
    expect(match.relist.condition).toBe('fair');
  });
});

describe('matchDemand: who is still waiting (D62)', () => {
  it('an entry whose need date has passed is expired, not the earliest', () => {
    const later = assessReturn({ ...ebike007, isoDate: '2026-11-11' }, data);
    const match = matchDemand(later, pack.demand);
    expect(match.verdicts.find((v) => v.demandId === 'wait-02')!.outcome).toEqual({
      code: 'expired',
      params: { neededBy: '2026-11-10', isoDate: '2026-11-11' },
    });
    // wait-13 (same day) is expired too, wait-03 is over budget: wait-04 is left.
    expect(match.winner?.demandId).toBe('wait-04');
  });

  it('needed on the assessment day itself still counts', () => {
    const onTheDay = assessReturn({ ...ebike007, isoDate: '2026-11-10' }, data);
    expect(matchDemand(onTheDay, pack.demand).winner?.demandId).toBe('wait-02');
  });

  it('an entry an earlier assessment matched is not matched twice', () => {
    const match = matchDemand(assessed, pack.demand, ['wait-02']);
    expect(match.verdicts.find((v) => v.demandId === 'wait-02')!.outcome.code).toBe(
      'already_matched'
    );
    expect(match.winner?.demandId).toBe('wait-13');
  });
});

describe('card 10 on a later clock (D62)', () => {
  it('on 2026-11-09 wait-05 (needed by 11-08) is expired and wait-13 wins ebike-008', () => {
    const ebike008 = assessReturn(
      {
        assetId: 'ebike-008',
        category: 'e_bike',
        condition: 'good',
        usage: { unit: 'km', value: 9_800 },
        age: { modelYear: 2022, previousLives: 2, leaseStart: '2022-01-01' },
        newPriceCents: 179_900,
        isoDate: '2026-11-09',
      },
      data
    );
    const match = matchDemand(ebike008, pack.demand);
    expect(match.verdicts.find((v) => v.demandId === 'wait-05')!.outcome.code).toBe('expired');
    // wait-02 and wait-13 tie on the first two steps; 24 × 1 359 beats 12 × 2 078.
    expect(match.ranking.slice(0, 2).map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['wait-13', null],
      ['wait-02', 'total_rent'],
    ]);
  });
});
