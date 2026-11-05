// How an item can be financed (the catalogue's offer). The coefficient table limits the amount
// financed (net list price − down payment), not the item's price, so an item above the highest
// band is not unleasable: a down payment brings the financed amount down to the maximum
// (farm-006 at 260 000 € needs 10 000 € down). An item below the lowest band is offered as the
// smallest number of units that reaches the minimum, as the price page already finances
// several together (D8, D41): ebike-010 at 289 € is leased two together (578 €). Only past
// MAX_QUANTITY does it stay refused. Pure; the caller passes the day.
import { priceQuote, type PricingData, type QuoteBreakdown, type QuoteRefusal } from './quote';

/** The most units one quote finances together (the price page's quantity field). */
export const MAX_QUANTITY = 20;

export type FinanceOffer =
  | { kind: 'standard'; quote: QuoteBreakdown }
  | { kind: 'needs_down_payment'; downPaymentCents: number; quote: QuoteBreakdown }
  /** Below the minimum alone; `reason` keeps the one-unit refusal for the explanation. */
  | {
      kind: 'needs_quantity';
      quantity: number;
      quote: QuoteBreakdown;
      reason: Extract<QuoteRefusal, { code: 'below_minimum' }>;
    }
  | { kind: 'none'; reason: QuoteRefusal };

export function financeOffer(
  data: PricingData,
  input: { assetId: string; termMonths: number; isoDate: string }
): FinanceOffer {
  const base = { ...input, quantity: 1, downPaymentCents: 0 };
  const plain = priceQuote(data, base);
  if (plain.ok) return { kind: 'standard', quote: plain.quote };

  const { reason } = plain;
  if (reason.code === 'above_maximum') {
    // Paying the excess at the start leaves exactly the maximum to finance (limits inclusive).
    const downPaymentCents = reason.params.financedCents - reason.params.maximumCents;
    const withDown = priceQuote(data, { ...base, downPaymentCents });
    if (withDown.ok) return { kind: 'needs_down_payment', downPaymentCents, quote: withDown.quote };
    return { kind: 'none', reason: withDown.reason };
  }
  if (reason.code === 'below_minimum') {
    // financed = unit price × quantity with nothing down, so the smallest quantity reaching
    // the minimum is the ceiling of minimum ÷ unit price (integer cents, no rounding of money).
    const unit = reason.params.financedCents;
    const quantity = unit > 0 ? Math.ceil(reason.params.minimumCents / unit) : Infinity;
    if (quantity > MAX_QUANTITY) return { kind: 'none', reason };
    const together = priceQuote(data, { ...base, quantity });
    if (together.ok) return { kind: 'needs_quantity', quantity, quote: together.quote, reason };
    return { kind: 'none', reason: together.reason };
  }
  return { kind: 'none', reason };
}
