// The money a second or third life saves (smart problem 7, decision D80), by the method of the
// CO2 (D15, co2.ts): a later life stands in for a new item, so it is credited with
//   new net list price × (1 − refurbishment share) × counted months ÷ design life months,
// the price of a new item net of refurbishing it, spread over the months the item is built to
// last and counted for the months that life used. The first life earns nothing, and once the
// lives add up to the design life a further life earns nothing: an almost worn-out item saves
// little, the same answer the CO2 gives.
//
// The new price is the item's net list price on the day asked about (the price list in force,
// the same one the catalogue shows), so the saving is in today's money. The refurbishment
// share is the data pack's `refurbishment_share_of_new`: it is the only refurbishment figure
// that applies to every life, past ones included; the real plan costs exist only for the
// returns assessed in the app.
//
// Rounding (D1): integer arithmetic on cents and the share in millionths, then one division,
// half up to the cent. An item's total is rounded once from the exact sum of its lives, and a
// category's row once from the exact sum of its items; the fleet total is the sum of the rows,
// so the breakdown on a page always adds up.
import type { AssetCategory } from '@/data/schemas';
import { factorToMillionths, roundHalfUpDivBig } from '../money-math';
import { countedMonths, type Co2Method, type LifeInput } from './co2';

const MILLION = 1_000_000n;

export type MoneyLifeInput = LifeInput & {
  /** The item's net list price as new on the day, in cents. */
  newPriceCents: number;
};

const assertWholeNonNegative = (name: string, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of at least 0, got ${value}`);
  }
};

/** The exact saving of one life in cent-millionths × months, over `denominator`. */
function savedNumerator(method: Co2Method, life: MoneyLifeInput): bigint {
  assertWholeNonNegative('newPriceCents', life.newPriceCents);
  const counted = countedMonths(method, life);
  const keptMillionths =
    MILLION - BigInt(factorToMillionths(method.factors.refurbishment_share_of_new));
  return BigInt(life.newPriceCents) * keptMillionths * BigInt(counted);
}

const denominator = (method: Co2Method, category: AssetCategory) =>
  MILLION * BigInt(method.designLifeMonths[category]);

/** Cents one life saved, rounded half up. 0 for the first life and past the design life. */
export function moneySavedByLife(method: Co2Method, life: MoneyLifeInput): number {
  return Number(
    roundHalfUpDivBig(savedNumerator(method, life), denominator(method, life.category))
  );
}

/** One item: its category, its price as new on the day (null when no list prices it), its lives. */
export type AssetMoneyLives = {
  category: AssetCategory;
  newPriceCents: number | null;
  lives: readonly { months: number }[];
};

export type AssetMoney = {
  /** Per life, each rounded (for display; the total is not their sum). */
  perLifeCents: number[];
  /** The exact sum of the lives, rounded once. */
  totalCents: number;
};

function assetNumerators(method: Co2Method, asset: AssetMoneyLives): bigint[] {
  let monthsUsedBefore = 0;
  return asset.lives.map((life, lifeIndex) => {
    const numerator =
      asset.newPriceCents === null
        ? 0n
        : savedNumerator(method, {
            category: asset.category,
            lifeIndex,
            months: life.months,
            monthsUsedBefore,
            newPriceCents: asset.newPriceCents,
          });
    monthsUsedBefore += life.months;
    return numerator;
  });
}

/** The money an item's later lives saved; each life uses up the design life in turn. */
export function moneySavedForAsset(method: Co2Method, asset: AssetMoneyLives): AssetMoney {
  const den = denominator(method, asset.category);
  const numerators = assetNumerators(method, asset);
  const total = numerators.reduce((sum, value) => sum + value, 0n);
  return {
    perLifeCents: numerators.map((value) => Number(roundHalfUpDivBig(value, den))),
    totalCents: Number(roundHalfUpDivBig(total, den)),
  };
}

export type FleetMoney = {
  /** Every category, in the order of `designLifeMonths`, even an empty one. */
  perCategory: { category: AssetCategory; cents: number }[];
  /** The sum of the category rows. */
  totalCents: number;
};

/** The money the whole fleet's later lives saved, per category and overall. */
export function fleetMoneySaved(method: Co2Method, assets: readonly AssetMoneyLives[]): FleetMoney {
  const categories = Object.keys(method.designLifeMonths) as AssetCategory[];
  const perCategory = categories.map((category) => {
    let numerator = 0n;
    for (const asset of assets) {
      if (asset.category !== category) continue;
      for (const value of assetNumerators(method, asset)) numerator += value;
    }
    return {
      category,
      cents: Number(roundHalfUpDivBig(numerator, denominator(method, category))),
    };
  });
  return {
    perCategory,
    totalCents: perCategory.reduce((sum, row) => sum + row.cents, 0),
  };
}
