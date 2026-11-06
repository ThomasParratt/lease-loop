// The assessment of a returned item (smart problem 3, D12): what each way of relisting it
// costs and what it would rent for.
//
// The options: stay as returned (only the mandatory fixed steps of the refurbishment plan), or
// climb to each higher condition the cost table has upgrades for, up to like new. For each:
// - the refurbishment plan (`refurbishmentPlan`, the data's own `when` rules);
// - the market value after it (`marketValueCents`: the net list price at the first lease ×
//   the curve at the item's age × the condition multiplier after the plan × the usage
//   adjustment after the plan, so a new battery resets the usage loss);
// - the second-life financed amount, D12: market value + refurbishment cost;
// - the monthly net rent for each allowed term (D43), priced by `priceQuote` itself on that
//   amount, so a quote made later on the relisted item gives exactly the same rent.
// Money: every amount is integer cents, rounded half up once inside the functions it comes
// from (the market value once, the rent once); the D12 sum adds whole cents.
import type {
  AssetCategory,
  AssetCondition,
  RefurbishmentCosts,
  ResidualCurves,
  UsageUnit,
} from '@/data/schemas';
import { allowedTerms, priceQuote, type PricingData, type QuoteRefusal } from '../pricing';
import { refurbishmentPlan, type RefurbishmentPlan } from '../refurbishment/plan';
import { curveAgeInMonths, type CurveAgeInput } from '../residual/age';
import { marketValueCents, type MarketValue } from '../residual/market-value';

/** Worst first. An item is never refurbished to `new`: the cost table stops at like new. */
export const CONDITION_ORDER: readonly AssetCondition[] = [
  'poor',
  'fair',
  'good',
  'like_new',
  'new',
];
const HIGHEST_TARGET: AssetCondition = 'like_new';

export const conditionRank = (condition: AssetCondition): number =>
  CONDITION_ORDER.indexOf(condition);

export type AssessInput = {
  assetId: string;
  category: AssetCategory;
  /** As returned. */
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
  /** The usage at the last per-block service (review finding 7); absent: none on record. */
  usageAtLastService?: number;
  /** For the curve age (D11 / D31). */
  age: CurveAgeInput;
  /** Net list price of one unit at its first lease (D60: `firstLeaseListPriceCents`). */
  newPriceCents: number;
  /** The assessment day, ISO. */
  isoDate: string;
};

export type AssessData = {
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
  pricing: PricingData;
};

export type TermRent = {
  termMonths: number;
  /** Null when the amount cannot be leased on this term (`refusal` says why). */
  monthlyNetCents: number | null;
  band: string | null;
  refusal: QuoteRefusal['code'] | null;
};

export type ReturnOption = {
  /** The condition after the plan. */
  condition: AssetCondition;
  /** True when the plan has condition upgrades beyond the mandatory fixed steps. */
  upgrade: boolean;
  plan: RefurbishmentPlan;
  marketValue: MarketValue;
  /** D12: market value + refurbishment cost. */
  secondLifeFinancedCents: number;
  rents: TermRent[];
};

export type ReturnAssessmentResult = {
  assetId: string;
  isoDate: string;
  category: AssetCategory;
  ageMonths: number;
  returnedCondition: AssetCondition;
  /** As returned first, then each higher condition. */
  options: ReturnOption[];
};

/** D60's earliest-price-list read lives with the rest of the rule (first-lease.ts). */
export { firstLeaseListPriceCents } from './first-lease';

/**
 * The pricing data with `assetId` priced at `cents` in every price list: how a relisted item is
 * quoted on its second-life amount (D12) while the quote keeps the live list's version.
 */
export function withSecondLifePrice(
  pricing: PricingData,
  assetId: string,
  cents: number
): PricingData {
  return {
    ...pricing,
    priceLists: pricing.priceLists.map((list) =>
      list.prices[assetId] === undefined
        ? list
        : { ...list, prices: { ...list.prices, [assetId]: cents } }
    ),
  };
}

function rentsFor(input: AssessInput, data: AssessData, financedCents: number): TermRent[] {
  const priced = withSecondLifePrice(data.pricing, input.assetId, financedCents);
  return allowedTerms(input.category, data.pricing.table, data.pricing.termLimits).map(
    (termMonths) => {
      const quote = priceQuote(priced, {
        assetId: input.assetId,
        termMonths,
        downPaymentCents: 0,
        isoDate: input.isoDate,
      });
      return quote.ok
        ? {
            termMonths,
            monthlyNetCents: quote.quote.monthlyNetCents,
            band: quote.quote.band,
            refusal: null,
          }
        : { termMonths, monthlyNetCents: null, band: null, refusal: quote.reason.code };
    }
  );
}

/** Every way to relist the returned item, as returned first. */
export function assessReturn(input: AssessInput, data: AssessData): ReturnAssessmentResult {
  const ageMonths = curveAgeInMonths(input.age, input.isoDate);
  const from = conditionRank(input.condition);
  const top = Math.max(from, conditionRank(HIGHEST_TARGET));
  const options: ReturnOption[] = [];

  for (let rank = from; rank <= top; rank += 1) {
    const target = CONDITION_ORDER[rank]!;
    const plan = refurbishmentPlan(
      {
        category: input.category,
        condition: input.condition,
        usage: input.usage,
        usageAtLastService: input.usageAtLastService,
        targetCondition: target,
      },
      data.costs
    );
    const marketValue = marketValueCents(
      {
        listPriceCents: input.newPriceCents,
        category: input.category,
        ageMonths,
        condition: plan.conditionAfter,
        usage: plan.usageAfter,
      },
      data.curves
    );
    const secondLifeFinancedCents = marketValue.valueCents + plan.totalCents;
    options.push({
      condition: plan.conditionAfter,
      upgrade: plan.upgradeCents > 0,
      plan,
      marketValue,
      secondLifeFinancedCents,
      rents: rentsFor(input, data, secondLifeFinancedCents),
    });
  }

  return {
    assetId: input.assetId,
    category: input.category,
    isoDate: input.isoDate,
    ageMonths,
    returnedCondition: input.condition,
    options,
  };
}
