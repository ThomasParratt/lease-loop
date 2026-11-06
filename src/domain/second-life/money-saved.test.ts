// Smart problem 7 (circular impact), the money half, and decision D80: a later life saves the
// share of a new item's price that it stood in for, net of refurbishment, pro rata to the
// months of the design life that life used, exactly like the CO2 of D15. Card 10 (`ebike-008`,
// third life) is pinned at the end.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCo2Factors, loadPriceLists } from '@/data/load';
import type { Co2Factors, PriceList } from '@/data/schemas';
import { listPriceOn } from '../price-list';
import { ASSUMED_PAST_LIFE_MONTHS, co2Method, type Co2Method } from './co2';
import { fleetMoneySaved, moneySavedByLife, moneySavedForAsset } from './money-saved';

const factors: Co2Factors = {
  note: 'test',
  manufacturing_new_kg: { e_bike: 165, laptop: 330, farm_machine: 18000 },
  refurbishment_share_of_new: 0.12,
  avoided_by_reuse_formula_hint: 'test',
  e_bike_avoided_car_km_kg_per_km: 0.15,
};

/** A 60-month design life for every category, so the fractions read easily. */
const sixty: Co2Method = co2Method(factors, { e_bike: 60, laptop: 60, farm_machine: 60 });

describe('moneySavedByLife', () => {
  it('the first life saves nothing: the item was bought new for it', () => {
    expect(
      moneySavedByLife(sixty, {
        category: 'e_bike',
        lifeIndex: 0,
        months: 24,
        newPriceCents: 300_000,
      })
    ).toBe(0);
  });

  it('a whole design life of later use saves the new price net of the 12 % refurbishment', () => {
    // 300 000 × 0.88 = 264 000
    expect(
      moneySavedByLife(sixty, {
        category: 'e_bike',
        lifeIndex: 1,
        months: 60,
        newPriceCents: 300_000,
      })
    ).toBe(264_000);
  });

  it('a short life saves a short share: 7 of 60 months, rounded half up once', () => {
    // 100 001 × 0.88 × 7 / 60 = 10 266.769… → 10 267
    expect(
      moneySavedByLife(sixty, {
        category: 'laptop',
        lifeIndex: 1,
        months: 7,
        newPriceCents: 100_001,
      })
    ).toBe(10_267);
  });

  it('an almost worn-out item saves only what is left of its design life', () => {
    // 54 of 60 months used: a 24-month life counts 6. 300 000 × 0.88 × 6 / 60 = 26 400
    expect(
      moneySavedByLife(sixty, {
        category: 'e_bike',
        lifeIndex: 2,
        months: 24,
        monthsUsedBefore: 54,
        newPriceCents: 300_000,
      })
    ).toBe(26_400);
    expect(
      moneySavedByLife(sixty, {
        category: 'e_bike',
        lifeIndex: 2,
        months: 24,
        monthsUsedBefore: 60,
        newPriceCents: 300_000,
      })
    ).toBe(0);
  });

  it('a farm machine at the top of the price list stays exact (no float, no overflow)', () => {
    // 26 000 000 × 0.88 × 144 / 144
    const big = co2Method(factors, { e_bike: 144, laptop: 144, farm_machine: 144 });
    expect(
      moneySavedByLife(big, {
        category: 'farm_machine',
        lifeIndex: 1,
        months: 144,
        newPriceCents: 26_000_000,
      })
    ).toBe(22_880_000);
  });

  it('refuses a price or a month count that is not a whole number of at least 0', () => {
    const life = { category: 'e_bike' as const, lifeIndex: 1, months: 2, newPriceCents: 100 };
    expect(() => moneySavedByLife(sixty, { ...life, newPriceCents: 10.5 })).toThrow(RangeError);
    expect(() => moneySavedByLife(sixty, { ...life, newPriceCents: -1 })).toThrow(RangeError);
    expect(() => moneySavedByLife(sixty, { ...life, months: -1 })).toThrow(RangeError);
  });
});

describe('moneySavedForAsset', () => {
  it('each life uses up the design life in turn; the total is rounded once', () => {
    // 100 001 × 0.88 = 88 000.88 over 60 months; lives of 24, 7 and 7 months
    const result = moneySavedForAsset(sixty, {
      category: 'laptop',
      newPriceCents: 100_001,
      lives: [{ months: 24 }, { months: 7 }, { months: 7 }],
    });
    expect(result.perLifeCents).toEqual([0, 10_267, 10_267]);
    // 88 000.88 × 14 / 60 = 20 533.538… → 20 534, not 10 267 + 10 267
    expect(result.totalCents).toBe(20_534);
  });

  it('an item with no price on the day saves nothing it can show', () => {
    const result = moneySavedForAsset(sixty, {
      category: 'e_bike',
      newPriceCents: null,
      lives: [{ months: 24 }, { months: 24 }],
    });
    expect(result).toEqual({ perLifeCents: [0, 0], totalCents: 0 });
  });
});

describe('fleetMoneySaved', () => {
  it('sums per category, rounding each category once; the total adds the rows', () => {
    const fleet = fleetMoneySaved(sixty, [
      { category: 'laptop', newPriceCents: 100_001, lives: [{ months: 24 }, { months: 7 }] },
      { category: 'laptop', newPriceCents: 100_001, lives: [{ months: 24 }, { months: 7 }] },
      { category: 'e_bike', newPriceCents: 300_000, lives: [{ months: 24 }] },
    ]);
    expect(fleet.perCategory).toEqual([
      { category: 'e_bike', cents: 0 },
      { category: 'laptop', cents: 20_534 },
      { category: 'farm_machine', cents: 0 },
    ]);
    expect(fleet.totalCents).toBe(20_534);
  });

  it('an empty fleet has saved nothing', () => {
    expect(fleetMoneySaved(sixty, []).totalCents).toBe(0);
  });
});

describe('the data pack', () => {
  let packFactors: Co2Factors;
  let priceLists: PriceList[];
  beforeAll(async () => {
    [packFactors, priceLists] = await Promise.all([loadCo2Factors(), loadPriceLists()]);
  });

  it('card 10: ebike-008 on 6 Nov 2026 has saved 332,46 €, and 664,93 € after its third life', async () => {
    const assets = await loadAssets();
    const ebike = assets.find((asset) => asset.id === 'ebike-008')!;
    const price = listPriceOn(priceLists, 'ebike-008', '2026-11-06');
    expect(price).toEqual({ ok: true, priceCents: 188_900, priceListVersion: 2 });

    const method = co2Method(packFactors);
    const past = Array.from({ length: ebike.previous_lives }, () => ({
      months: ASSUMED_PAST_LIFE_MONTHS,
    }));
    // 188 900 × 0.88 over 120 months = 1 385.27 a month; a 24-month life is 33 246.4
    const before = moneySavedForAsset(method, {
      category: 'e_bike',
      newPriceCents: 188_900,
      lives: past,
    });
    expect(before).toEqual({ perLifeCents: [0, 33_246], totalCents: 33_246 });

    const after = moneySavedForAsset(method, {
      category: 'e_bike',
      newPriceCents: 188_900,
      lives: [...past, { months: 24 }],
    });
    expect(after.perLifeCents).toEqual([0, 33_246, 33_246]);
    expect(after.totalCents).toBe(66_493); // 66 492.8, rounded once
  });
});
