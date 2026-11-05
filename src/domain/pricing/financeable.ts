// How an item can be financed (the catalogue's offer). The coefficient table limits the amount
// financed (net list price − down payment), not the item's price, so an item above the highest
// band is not unleasable: a down payment brings the financed amount down to the maximum
// (farm-006 at 260 000 € needs 10 000 € down). An item below the lowest band stays refused:
// the pack's formula has no quantity for it, and whether several units of one asset row may
// be financed together (D8) is an open question for the mentors. Pure; the caller passes the day.
import { priceQuote, type PricingData, type QuoteBreakdown, type QuoteRefusal } from './quote';

export type FinanceOffer =
  | { kind: 'standard'; quote: QuoteBreakdown }
  | { kind: 'needs_down_payment'; downPaymentCents: number; quote: QuoteBreakdown }
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
  return { kind: 'none', reason };
}
