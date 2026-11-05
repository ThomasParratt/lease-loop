// Signing: turns an approved application and its stored quote into a contract and the
// CONTRACT_SIGNED event, or refuses with a code. Pure: the caller reads the rows, the day and
// the price list in force, and writes the result. The contract copies the quote's frozen
// numbers and never re-prices (D7); a later price list only changes what the page explains.
import { assetStatusSchema, isoDateSchema } from '@/data/schemas';
import { contractSignedSchema, type ContractSigned } from '@/domain/events';
import { addDays } from '@/domain/civil-days';
import { termEndDate } from '@/domain/invoicing/dates';
import type { FrozenQuote, QuoteStatus } from '@/domain/pricing';
import { applicationDecisionSchema, type ContractStatus } from '@/domain/statuses';
import { contractNumber } from './number';

/** The latest start is this many days after the signing day (D7 lets the start come later). */
export const START_DAYS_MAX = 90;

export type PlanContractInput = {
  /** The new contract's id, chosen by the caller so the event can name it. */
  contractId: string;
  applicationId: string;
  customerId: string;
  /** The application's decision; parsed here (D23). */
  decision: string;
  /** The asset's status as read before signing; parsed here (D23). */
  assetStatus: string;
  /** The stored quote's frozen numbers; `isoDate` is the quote day. */
  quote: FrozenQuote & { validUntil: string };
  /** The stored quote's status on the signing day (`storedQuoteStatusOn`). */
  quoteStatus: QuoteStatus;
  /** What the same quote would cost today on today's list, or null when none prices it. */
  currentMonthlyNetCents: number | null;
  /** The request's day (`todayForRequest()`), never the browser's. */
  signedOn: string;
  startDate: string;
};

export type PlannedContract = {
  id: string;
  number: string;
  applicationId: string;
  customerId: string;
  assetId: string;
  quantity: number;
  signedOn: string;
  startDate: string;
  /** Inclusive: the last day of the term. */
  endDate: string;
  termMonths: number;
  unitListPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  band: string;
  factorMillionths: number;
  monthlyNetCents: number;
  buyoutCents: number;
  vatRateBasisPoints: number;
  priceListVersion: number;
  status: ContractStatus;
};

/** Why the contract's price differs from today's list (card 2). The page writes it. */
export type PriceLock = {
  code: 'price_locked_from_quote';
  params: {
    quoteDate: string;
    priceListVersion: number;
    currentPriceListVersion: number;
    currentMonthlyNetCents: number;
  };
};

export type SignRefusal =
  | { code: 'application_not_approved'; params: { decision: string } }
  | { code: 'quote_expired'; params: { validUntil: string } }
  | { code: 'asset_not_available'; params: { status: string } }
  | { code: 'start_before_signing'; params: { signedOn: string; startDate: string } }
  | {
      code: 'start_too_far';
      params: { latestStartDate: string; startDate: string; maxDays: number };
    };

export type PlanContractResult =
  | { ok: true; contract: PlannedContract; event: ContractSigned; priceLock: PriceLock | null }
  | { ok: false; reason: SignRefusal };

/**
 * Plans a signing. Refusals in this order: the decision, the quote's validity, the asset, the
 * start day. A bad decision, status or day throws (D23): the caller writes nothing.
 */
export function planContract(input: PlanContractInput): PlanContractResult {
  const decision = applicationDecisionSchema.parse(input.decision);
  const assetStatus = assetStatusSchema.parse(input.assetStatus);
  const signedOn = isoDateSchema.parse(input.signedOn);
  const startDate = isoDateSchema.parse(input.startDate);
  const { quote, quoteStatus } = input;

  if (decision !== 'approved') {
    return { ok: false, reason: { code: 'application_not_approved', params: { decision } } };
  }
  if (quoteStatus.status === 'expired') {
    return {
      ok: false,
      reason: { code: 'quote_expired', params: { validUntil: quote.validUntil } },
    };
  }
  if (assetStatus !== 'available') {
    return { ok: false, reason: { code: 'asset_not_available', params: { status: assetStatus } } };
  }
  // ISO days compare correctly as strings.
  if (startDate < signedOn) {
    return { ok: false, reason: { code: 'start_before_signing', params: { signedOn, startDate } } };
  }
  const latestStartDate = addDays(signedOn, START_DAYS_MAX);
  if (startDate > latestStartDate) {
    return {
      ok: false,
      reason: {
        code: 'start_too_far',
        params: { latestStartDate, startDate, maxDays: START_DAYS_MAX },
      },
    };
  }

  const endDate = termEndDate(startDate, quote.termMonths);
  const contract: PlannedContract = {
    id: input.contractId,
    number: contractNumber(signedOn, input.applicationId),
    applicationId: input.applicationId,
    customerId: input.customerId,
    assetId: quote.assetId,
    quantity: quote.quantity,
    signedOn,
    startDate,
    endDate,
    termMonths: quote.termMonths,
    unitListPriceCents: quote.unitListPriceCents,
    downPaymentCents: quote.downPaymentCents,
    financedCents: quote.financedCents,
    band: quote.band,
    factorMillionths: quote.factorMillionths,
    monthlyNetCents: quote.monthlyNetCents,
    buyoutCents: quote.buyoutCents,
    vatRateBasisPoints: quote.vatRateBasisPoints,
    priceListVersion: quote.priceListVersion,
    status: 'active',
  };
  const event = contractSignedSchema.parse({
    type: 'CONTRACT_SIGNED',
    contractId: contract.id,
    customerId: contract.customerId,
    assetId: contract.assetId,
    quantity: contract.quantity,
    signedOn,
    startDate,
    endDate,
    termMonths: contract.termMonths,
    downPaymentCents: contract.downPaymentCents,
    netRentCents: contract.monthlyNetCents,
    buyoutCents: contract.buyoutCents,
    vatRateBasisPoints: contract.vatRateBasisPoints,
  });
  return { ok: true, contract, event, priceLock: priceLockOf(input) };
}

/** The explanation when today's list is another version than the quote's; else null. */
export function priceLockOf(input: {
  quote: Pick<FrozenQuote, 'isoDate' | 'priceListVersion'>;
  quoteStatus: Pick<QuoteStatus, 'todayList'>;
  currentMonthlyNetCents: number | null;
}): PriceLock | null {
  const { todayList } = input.quoteStatus;
  if (todayList === null || input.currentMonthlyNetCents === null) return null;
  if (todayList.version === input.quote.priceListVersion) return null;
  return {
    code: 'price_locked_from_quote',
    params: {
      quoteDate: input.quote.isoDate,
      priceListVersion: input.quote.priceListVersion,
      currentPriceListVersion: todayList.version,
      currentMonthlyNetCents: input.currentMonthlyNetCents,
    },
  };
}
