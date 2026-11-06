// Card 9, second life: `ebike-007` comes back fair at 18 400 km. The refurbishment plan and
// the waiting-list match are in src/domain/second-life; the harness pins the facts the card
// rests on, and the assessment and the match pin the judged numbers.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema } from '@/data/schemas';
import { refurbishmentPlan } from '../refurbishment/plan';
import { assessReturn, firstLeaseListPriceCents } from '../second-life/assess';
import { matchDemand } from '../second-life/match';
import { assetById, pack, pricing } from './fixtures';

const entry = (id: string) => pack.demand.find((d) => d.id === id);

describe('card 9: second life (ebike-007, fair, 18 400 km)', () => {
  it('ebike-007 is returned, fair, 18 400 km, after one life', () => {
    expect(assetById('ebike-007')).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage: { unit: 'km', value: 18_400 },
      previous_lives: 1,
    });
  });

  it('wait-02 takes fair at 12 months, wait-13 needs good at 24, both up to 9 000 net', () => {
    expect(entry('wait-02')).toMatchObject({
      category: 'e_bike',
      min_condition: 'fair',
      preferred_term_months: 12,
      max_monthly_net_rent_cents: 9_000,
    });
    expect(entry('wait-13')).toMatchObject({
      category: 'e_bike',
      min_condition: 'good',
      preferred_term_months: 24,
      max_monthly_net_rent_cents: 9_000,
    });
  });

  it('the refurbishment plan to good: battery 35 000 (usage reset), inspection 4 500, 12 000 more', () => {
    const plan = refurbishmentPlan(
      {
        category: 'e_bike',
        condition: 'fair',
        usage: { unit: 'km', value: 18_400 },
        targetCondition: 'good',
      },
      refurbishmentCostsSchema.parse(refurbishmentJson)
    );
    expect(plan.steps.map((s) => [s.id, s.costCents])).toEqual([
      ['battery_replacement', 35_000],
      ['safety_inspection', 4_500],
      ['fair->good', 12_000],
    ]);
    expect([plan.fixedCents, plan.upgradeCents, plan.totalCents]).toEqual([39_500, 12_000, 51_500]);
    expect(plan.usageAfter).toEqual({ unit: 'km', value: 0 });
    expect(plan.conditionAfter).toBe('good');
  });

  // The judged flow: the assessment (D12) and the match (D13, D61) on the pack.
  const assessed = assessReturn(
    {
      assetId: 'ebike-007',
      category: 'e_bike',
      condition: 'fair',
      usage: { unit: 'km', value: 18_400 },
      age: { modelYear: 2023, previousLives: 1, leaseStart: '2023-01-01' },
      newPriceCents: firstLeaseListPriceCents(pricing.priceLists, 'ebike-007')!,
      isoDate: '2026-11-06',
    },
    {
      curves: residualCurvesSchema.parse(residualJson),
      costs: refurbishmentCostsSchema.parse(refurbishmentJson),
      pricing,
    }
  );
  const match = matchDemand(assessed, pack.demand);
  const option = (c: string) => assessed.options.find((o) => o.condition === c)!;

  it('the battery is replaced (35 000, over 15 000 km) and usage resets', () => {
    const battery = option('fair').plan.steps.find((s) => s.id === 'battery_replacement');
    expect(battery).toMatchObject({ costCents: 35_000, resetsUsage: true });
    expect(option('fair').plan.usageAfter.value).toBe(0);
  });

  it('the safety inspection 4 500 is always charged', () => {
    for (const o of assessed.options) {
      expect(o.plan.steps.find((s) => s.id === 'safety_inspection')?.costCents).toBe(4_500);
    }
  });

  it('fair to good costs 12 000 more', () => {
    expect(option('good').plan.totalCents - option('fair').plan.totalCents).toBe(12_000);
  });

  it('as is, it matches wait-02 (fair, 12 months, up to 9 000): 132 281 financed, 7 411 a month', () => {
    // 549 000 × 32.5 % (46 months) × 0.65 = 92 781 + 39 500 = 132 281; × 0.056022 = 7 411.
    expect(option('fair').secondLifeFinancedCents).toBe(132_281);
    expect(match.winner).toMatchObject({
      demandId: 'wait-02',
      condition: 'fair',
      upgrade: false,
      termMonths: 12,
      monthlyNetCents: 7_411,
    });
    expect(match.decision.code).toBe('relist_for_winner');
    expect(match.relist.condition).toBe('fair');
  });

  it('refurbished to good, it matches wait-13 (good, 24 months, up to 9 000) and ranks second', () => {
    // 549 000 × 32.5 % × 0.85 = 121 329 + 51 500 = 172 829 (band B); × 0.035532 = 6 332.
    expect(option('good').secondLifeFinancedCents).toBe(172_829);
    expect(match.ranking[1]).toMatchObject({
      demandId: 'wait-13',
      condition: 'good',
      upgrade: true,
      monthlyNetCents: 6_332,
      decidedBy: 'no_refurbishment',
    });
  });
});
