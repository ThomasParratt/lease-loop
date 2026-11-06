// assessReturn: the options of a returned item (stay as returned, or each higher condition),
// each with its plan, market value, D12 second-life price and the rent per allowed term.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema, type PriceList } from '@/data/schemas';
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

  it('as returned: battery 35 000 + inspection 4 500, value as returned 92 781, price 132 281', () => {
    const fair = option('fair');
    expect(fair.plan.totalCents).toBe(39_500);
    expect(fair.plan.usageAfter).toEqual({ unit: 'km', value: 0 });
    // 549 000 × 32.5 % × 0.65 × 0.80 (18 400 km, −20 % cap) = 92 781 (D79: the usage as returned; the organisers' 927,81 €).
    expect(fair.marketValue.valueCents).toBe(92_781);
    expect(fair.secondLifeFinancedCents).toBe(92_781 + 39_500);
  });

  it('to good: 51 500 of work, value 121 329, price 172 829 (band B)', () => {
    const good = option('good');
    expect(good.plan.totalCents).toBe(51_500);
    expect(good.marketValue.valueCents).toBe(121_329);
    expect(good.secondLifeFinancedCents).toBe(172_829);
  });

  it('prices every allowed term on the D12 amount with the normal band and factor', () => {
    // 132 281, band A: 12 months 7 411, 24 months 4 846, 36 months 3 787, 48 months 3 168.
    expect(option('fair').rents.map((r) => [r.termMonths, r.monthlyNetCents])).toEqual([
      [12, 7_411],
      [24, 4_846],
      [36, 3_787],
      [48, 3_168],
    ]);
    // 172 829 is band A now (D79): 24 months at 6 332.
    expect(option('good').rents.find((r) => r.termMonths === 24)?.monthlyNetCents).toBe(6_332);
    expect(option('good').rents.find((r) => r.termMonths === 24)?.band).toBe('A');
  });
});

describe('assessReturn on other data', () => {
  it('a cheaper cost table changes the price, never the value', () => {
    const cheap = structuredClone(data.costs);
    cheap.e_bike.fixed = cheap.e_bike.fixed.map((f) => ({ ...f, cost_cents: 1_000 }));
    const result = assessReturn(ebike007, { ...data, costs: cheap });
    expect(result.options[0]!.plan.totalCents).toBe(2_000);
    expect(result.options[0]!.marketValue.valueCents).toBe(92_781);
    expect(result.options[0]!.secondLifeFinancedCents).toBe(94_781);
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
    const lists = withSecondLifePrice(pricing, 'ebike-007', 132_281).priceLists;
    expect(lists.map((l) => [l.version, l.prices['ebike-007']])).toEqual([
      [1, 132_281],
      [2, 132_281],
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
