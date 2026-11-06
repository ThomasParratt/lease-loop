// assessReturn: the options of a returned item (stay as returned, or each higher condition),
// each with its plan, market value, D12 second-life price and the rent per allowed term.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema, type PriceList } from '@/data/schemas';
import { marketValueCents } from '../residual/market-value';
import { pricing } from '../scenarios/fixtures';
import {
  assessReturn,
  firstLeaseListPriceCents,
  withSecondLifePrice,
  type AssessData,
  type AssessInput,
} from './assess';

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

describe('assessReturn (card 9: ebike-007, fair, 18 400 km)', () => {
  const result = assessReturn(ebike007, data);
  const option = (condition: string) => result.options.find((o) => o.condition === condition)!;

  it('ages the item by D11 (previous lives): 46 months from January 2023, 32.5 % on the curve', () => {
    expect(result.ageMonths).toBe(46);
    expect(option('fair').marketValue.curvePercent).toBe(32.5);
  });

  it('offers fair (as returned), good and like new, never a downgrade', () => {
    expect(result.options.map((o) => [o.condition, o.upgrade])).toEqual([
      ['fair', false],
      ['good', true],
      ['like_new', true],
    ]);
  });

  it('as returned: battery 35 000 + inspection 4 500, value with the new battery 115 976, price 155 476', () => {
    const fair = option('fair');
    expect(fair.plan.totalCents).toBe(39_500);
    // D83: the total stays on the odometer, the usage since the battery is 0.
    expect(fair.plan.usageAfter).toEqual({ unit: 'km', value: 18_400 });
    expect(fair.plan.usageSinceResetAfter).toEqual({ unit: 'km', value: 0 });
    // 549 000 × 32.5 % × 0.65 × 1.00 (0 km since the battery) = 115 976.25 → 115 976.
    expect(fair.marketValue.valueCents).toBe(115_976);
    expect(fair.marketValue.usageAdjustmentPercent).toBe(0);
    expect(fair.secondLifeFinancedCents).toBe(115_976 + 39_500);
  });

  it('to good: 51 500 of work, value 151 661, price 203 161 (band B)', () => {
    const good = option('good');
    expect(good.plan.totalCents).toBe(51_500);
    expect(good.marketValue.valueCents).toBe(151_661);
    expect(good.secondLifeFinancedCents).toBe(203_161);
  });

  it('prices every allowed term on the D12 amount with the normal band and factor', () => {
    // 155 476, band A: 12 months 8 710, 24 months 5 696, 36 months 4 451, 48 months 3 723.
    expect(option('fair').rents.map((r) => [r.termMonths, r.monthlyNetCents])).toEqual([
      [12, 8_710],
      [24, 5_696],
      [36, 4_451],
      [48, 3_723],
    ]);
    // 203 161 is band B: 24 months × 0.035532 = 7 218.72 → 7 219.
    expect(option('good').rents.find((r) => r.termMonths === 24)?.monthlyNetCents).toBe(7_219);
    expect(option('good').rents.find((r) => r.termMonths === 24)?.band).toBe('B');
  });
});

// The organisers' answer of 6 Nov 2026 (10:35), D83: `resets_usage: true` resets the usage
// adjustment in the market value and the next-replacement trigger; the total usage never resets.
describe("the organisers' example: ebike-007, 18 400 km, fair, 46 months on 6 Nov 2026", () => {
  const result = assessReturn(ebike007, data);
  const option = (condition: string) => result.options.find((o) => o.condition === condition)!;

  it('before the battery: 549 000 × 32.5 % × 0.65 × 0.80 (the −20 % cap) = 92 781', () => {
    const before = marketValueCents(
      {
        listPriceCents: 549_000,
        category: 'e_bike',
        ageMonths: result.ageMonths,
        condition: 'fair',
        usage: { unit: 'km', value: 18_400 },
      },
      data.curves
    );
    expect(before.valueCents).toBe(92_781);
    expect(before.usageAdjustmentPercent).toBe(-20);
  });

  it('with a new battery (usage → 0): 549 000 × 32.5 % × 0.65 × 1.00 = 115 976', () => {
    expect(option('fair').marketValue.valueCents).toBe(115_976);
  });

  it('also fair → good: 549 000 × 32.5 % × 0.85 × 1.00 = 151 661', () => {
    expect(option('good').marketValue.valueCents).toBe(151_661);
  });

  it('the gain against the cost: +58 880 of value for 51 500 of work (35 000 + 12 000 + 4 500)', () => {
    expect(option('good').marketValue.valueCents - 92_781).toBe(58_880);
    expect(option('good').plan.totalCents).toBe(35_000 + 12_000 + 4_500);
  });

  it('battery replaced at 18 400 km, back at 30 000: no new battery, the 11 600 km since count', () => {
    const again = assessReturn(
      { ...ebike007, usage: { unit: 'km', value: 30_000 }, usageAtLastReset: 18_400 },
      data
    );
    const fair = again.options[0]!;
    expect(fair.plan.steps.map((s) => s.id)).toEqual(['safety_inspection']);
    expect(fair.plan.usageAfter.value).toBe(30_000);
    expect(fair.marketValue.usageSteps).toBe(11);
    // 11 steps of −2 % is −22 %, held at the −20 % cap: 92 781 again.
    expect(fair.marketValue.valueCents).toBe(92_781);
  });
});

describe('assessReturn on other data', () => {
  it('a cheaper cost table changes the price, never the value', () => {
    const cheap = structuredClone(data.costs);
    cheap.e_bike.fixed = cheap.e_bike.fixed.map((f) => ({ ...f, cost_cents: 1_000 }));
    const result = assessReturn(ebike007, { ...data, costs: cheap });
    expect(result.options[0]!.plan.totalCents).toBe(2_000);
    expect(result.options[0]!.marketValue.valueCents).toBe(115_976);
    expect(result.options[0]!.secondLifeFinancedCents).toBe(117_976);
  });

  it('a first-life item is aged from its lease start (D31)', () => {
    const result = assessReturn(
      {
        ...ebike007,
        usage: { unit: 'km', value: 1_800 },
        age: { modelYear: 2026, previousLives: 0, leaseStart: '2025-11-06' },
      },
      data
    );
    expect(result.ageMonths).toBe(12);
    // No battery under 15 000 km: the usage stays and costs one 2 % step.
    expect(result.options[0]!.plan.totalCents).toBe(4_500);
    expect(result.options[0]!.marketValue.usageSteps).toBe(1);
  });

  it('an item worth too little to finance gets no rent, with the refusal code', () => {
    const result = assessReturn(
      { ...ebike007, newPriceCents: 1_000 },
      { ...data, costs: data.costs }
    );
    const tiny = assessReturn(
      { ...ebike007, assetId: 'ebike-010', newPriceCents: 1_000, usage: { unit: 'km', value: 0 } },
      { ...data, costs: { ...data.costs, e_bike: { ...data.costs.e_bike, fixed: [] } } }
    );
    expect(result.options[0]!.rents[0]!.monthlyNetCents).not.toBeNull();
    expect(tiny.options[0]!.rents[0]).toMatchObject({
      monthlyNetCents: null,
      refusal: 'below_minimum',
    });
  });

  it('an item returned like new has one option only', () => {
    const result = assessReturn({ ...ebike007, condition: 'like_new' }, data);
    expect(result.options.map((o) => o.condition)).toEqual(['like_new']);
  });

  it('a laptop is priced only on its allowed terms (D43: up to 36)', () => {
    const result = assessReturn(
      {
        assetId: 'laptop-001',
        category: 'laptop',
        condition: 'good',
        usage: { unit: 'battery_cycles', value: 120 },
        age: { modelYear: 2025, previousLives: 1, leaseStart: '2025-01-01' },
        newPriceCents: 119_900,
        isoDate: '2026-11-06',
      },
      data
    );
    expect(result.options[0]!.rents.map((r) => r.termMonths)).toEqual([12, 24, 36]);
  });
});

describe('withSecondLifePrice', () => {
  it('replaces the asset price in every list and keeps the versions and other prices', () => {
    const lists = withSecondLifePrice(pricing, 'ebike-007', 155_476).priceLists;
    expect(lists.map((l) => [l.version, l.prices['ebike-007']])).toEqual([
      [1, 155_476],
      [2, 155_476],
    ]);
    expect(lists[0]!.prices['ebike-001']).toBe(pricing.priceLists[0]!.prices['ebike-001']);
    expect(pricing.priceLists[0]!.prices['ebike-007']).toBe(549_000);
  });

  it('leaves a list without the asset alone', () => {
    const lists: PriceList[] = [{ ...pricing.priceLists[0]!, prices: { 'x-1': 100 } }];
    const out = withSecondLifePrice({ ...pricing, priceLists: lists }, 'ebike-007', 1);
    expect(out.priceLists[0]!.prices).toEqual({ 'x-1': 100 });
  });
});

describe('firstLeaseListPriceCents (D60)', () => {
  it('takes the earliest price list that has the asset', () => {
    expect(firstLeaseListPriceCents(pricing.priceLists, 'ebike-007')).toBe(549_000);
    expect(firstLeaseListPriceCents([...pricing.priceLists].reverse(), 'ebike-008')).toBe(179_900);
  });

  it('is null for an asset no list has', () => {
    expect(firstLeaseListPriceCents(pricing.priceLists, 'nope')).toBeNull();
  });
});
