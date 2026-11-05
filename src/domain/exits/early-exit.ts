// What leaving a contract costs (decision D14), for both exits, line by line.
//
// Before the end date:
// - buy    = the outstanding balance after the paid rents (`outstandingBalanceAfter`, the
//            financed amount amortised at the band's annual rate; never re-implemented here);
// - return = max(0, balance − market value by the curve) + the refurbishment to the leasable
//            condition. The refurbishment target is `good`: refurbishment-costs.json's note
//            says a returned item must reach at least good to be leased again.
// On or after the end date (the last day of the term):
// - buy    = the buyout frozen in the contract;
// - return = only the refurbishment.
// A pass-on costs what a return costs (D16: the item is assessed and re-priced like any return).
//
// `monthsPaid` is the number of paid rent invoices, capped at the term. Every line is a code
// with params (amounts in cents), so the page writes it in the visitor's language.
import type {
  AssetCategory,
  AssetCondition,
  RefurbishmentCosts,
  ResidualCurves,
} from '@/data/schemas';
import { outstandingBalanceAfter, type AmortisationRow } from '../invoicing/balance';
import { refurbishmentPlan, type RefurbishmentPlan } from '../refurbishment/plan';
import { curveAgeInMonths } from '../residual/age';
import { marketValueCents, type MarketValue, type Usage } from '../residual/market-value';
import type { InvoiceKind, InvoiceStatus } from '../statuses';

/** refurbishment-costs.json's note: "must reach at least 'good' to be leased again". */
export const LEASABLE_CONDITION: AssetCondition = 'good';

export type ExitLineEffect = 'add' | 'subtract' | 'subtotal' | 'info' | 'total';

export type ExitLine = {
  code:
    | 'months_paid'
    | 'balance'
    | 'remaining_rents'
    | 'buyout_at_end'
    | 'buyout'
    | 'market_value'
    | 'balance_after_value'
    | 'value_exceeds_balance'
    | 'refurb_fixed'
    | 'refurb_upgrade'
    | 'total';
  effect: ExitLineEffect;
  params: Record<string, string | number>;
};

export type ExitOption = { totalCents: number; lines: ExitLine[] };

export type ExitContractTerms = {
  financedCents: number;
  monthlyNetCents: number;
  termMonths: number;
  buyoutCents: number;
  /** The first day of the lease: the curve age of a first-life item counts from it (D31). */
  startDate: string;
  /** Inclusive: the last day of the term. */
  endDate: string;
  /** Net list price of one unit at signing: the first-lease price for the curve. */
  unitListPriceCents: number;
  quantity: number;
};

export type EarlyExitInput = {
  contract: ExitContractTerms;
  /** The band's `annual_interest_percent`. */
  annualInterestPercent: number;
  invoices: readonly { kind: InvoiceKind; status: InvoiceStatus }[];
  today: string;
  /** `previousLives` during this lease picks the curve age (D31). */
  asset: { category: AssetCategory; modelYear: number; previousLives: number };
  /** What the customer reports; the assessment (wave 3) checks it. */
  reported: { condition: AssetCondition; usage: Usage };
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
};

export type EarlyExitCost = {
  atOrAfterEnd: boolean;
  monthsPaid: number;
  /** The D14 balance after the paid rents (before the end), or the frozen buyout (at the end). */
  balanceCents: number;
  balanceRows: AmortisationRow[];
  /** The rents not yet paid, net: what staying would have cost, for comparison only. */
  remainingRentsNetCents: number;
  /** Per unit. */
  marketValue: MarketValue;
  /** Per unit. */
  refurbishment: RefurbishmentPlan;
  buy: ExitOption;
  return: ExitOption;
};

function refurbishmentLines(plan: RefurbishmentPlan, quantity: number): ExitLine[] {
  return plan.steps.map((step): ExitLine =>
    step.kind === 'fixed'
      ? {
          code: 'refurb_fixed',
          effect: 'add',
          params: { step: step.id, times: step.quantity, amountCents: step.costCents * quantity },
        }
      : {
          code: 'refurb_upgrade',
          effect: 'add',
          params: { from: step.from, to: step.to, amountCents: step.costCents * quantity },
        }
  );
}

const total = (amountCents: number): ExitLine => ({
  code: 'total',
  effect: 'total',
  params: { amountCents },
});

/** The cost of buying and of returning on `today`, line by line (D14). */
export function earlyExitCost(input: EarlyExitInput): EarlyExitCost {
  const { contract, today, asset, reported } = input;
  const paidRents = input.invoices.filter((i) => i.kind === 'rent' && i.status === 'paid').length;
  const monthsPaid = Math.min(paidRents, contract.termMonths);
  const atOrAfterEnd = today >= contract.endDate;
  const quantity = contract.quantity;

  const marketValue = marketValueCents(
    {
      listPriceCents: contract.unitListPriceCents,
      category: asset.category,
      ageMonths: curveAgeInMonths(
        {
          modelYear: asset.modelYear,
          previousLives: asset.previousLives,
          leaseStart: contract.startDate,
        },
        today
      ),
      condition: reported.condition,
      usage: reported.usage,
    },
    input.curves
  );
  const refurbishment = refurbishmentPlan(
    {
      category: asset.category,
      condition: reported.condition,
      usage: reported.usage,
      targetCondition: LEASABLE_CONDITION,
    },
    input.costs
  );
  const refurbCents = refurbishment.totalCents * quantity;
  const refurbLines = refurbishmentLines(refurbishment, quantity);
  const remainingMonths = contract.termMonths - monthsPaid;
  const remainingRentsNetCents = contract.monthlyNetCents * remainingMonths;

  if (atOrAfterEnd) {
    return {
      atOrAfterEnd,
      monthsPaid,
      balanceCents: contract.buyoutCents,
      balanceRows: [],
      remainingRentsNetCents,
      marketValue,
      refurbishment,
      buy: {
        totalCents: contract.buyoutCents,
        lines: [
          { code: 'buyout', effect: 'add', params: { amountCents: contract.buyoutCents } },
          total(contract.buyoutCents),
        ],
      },
      return: { totalCents: refurbCents, lines: [...refurbLines, total(refurbCents)] },
    };
  }

  const balance = outstandingBalanceAfter(
    {
      financedCents: contract.financedCents,
      annualInterestPercent: input.annualInterestPercent,
      monthlyNetCents: contract.monthlyNetCents,
      termMonths: contract.termMonths,
      buyoutCents: contract.buyoutCents,
    },
    monthsPaid
  );
  const balanceCents = Math.max(0, balance.balanceCents);
  const valueCents = marketValue.valueCents * quantity;
  const afterValue = Math.max(0, balanceCents - valueCents);
  const paidLine: ExitLine = {
    code: 'months_paid',
    effect: 'info',
    params: { months: monthsPaid, termMonths: contract.termMonths },
  };
  const balanceLine: ExitLine = {
    code: 'balance',
    effect: 'add',
    params: { months: monthsPaid, amountCents: balanceCents },
  };

  const returnLines: ExitLine[] = [
    paidLine,
    balanceLine,
    {
      code: 'market_value',
      effect: 'subtract',
      params: {
        amountCents: valueCents,
        ageMonths: marketValue.ageMonths,
        curvePercent: marketValue.curvePercent,
        condition: reported.condition,
        conditionMultiplier: marketValue.conditionMultiplier,
        usageValue: reported.usage.value,
        usageUnit: reported.usage.unit,
        usageAdjustmentPercent: marketValue.usageAdjustmentPercent,
      },
    },
    { code: 'balance_after_value', effect: 'subtotal', params: { amountCents: afterValue } },
  ];
  if (valueCents > balanceCents) {
    returnLines.push({
      code: 'value_exceeds_balance',
      effect: 'info',
      params: { amountCents: valueCents - balanceCents },
    });
  }
  returnLines.push(...refurbLines, total(afterValue + refurbCents));

  return {
    atOrAfterEnd,
    monthsPaid,
    balanceCents,
    balanceRows: balance.rows,
    remainingRentsNetCents,
    marketValue,
    refurbishment,
    buy: {
      totalCents: balanceCents,
      lines: [
        paidLine,
        balanceLine,
        {
          code: 'remaining_rents',
          effect: 'info',
          params: { months: remainingMonths, amountCents: remainingRentsNetCents },
        },
        { code: 'buyout_at_end', effect: 'info', params: { amountCents: contract.buyoutCents } },
        total(balanceCents),
      ],
    },
    return: { totalCents: afterValue + refurbCents, lines: returnLines },
  };
}
