// The term comparison: the same asset, quantity and down payment priced at every term the
// table offers, side by side, so the customer sees what a longer term costs in total.
import { priceQuote, termsOf, type PricingData, type QuoteInput, type QuoteRefusal } from './quote';

export type TermRow = {
  termMonths: number;
  band: string;
  monthlyNetCents: number;
  monthlyGrossCents: number;
  buyoutCents: number;
  /** The buyout with VAT at the quote day's rate, as the customer would pay it. */
  buyoutGrossCents: number;
  totalIfReturnCents: number;
  totalIfBuyCents: number;
};

export type TermComparison = {
  /** The terms that can be priced, shortest first. */
  rows: TermRow[];
  /** The terms that cannot, with the same refusal `priceQuote` gives. */
  unavailable: { termMonths: number; reason: QuoteRefusal }[];
};

/** Runs `priceQuote` once per term of the table with everything else held the same. */
export function compareTerms(
  data: PricingData,
  input: Omit<QuoteInput, 'termMonths'>
): TermComparison {
  const comparison: TermComparison = { rows: [], unavailable: [] };
  for (const termMonths of termsOf(data.table)) {
    const result = priceQuote(data, { ...input, termMonths });
    if (!result.ok) {
      comparison.unavailable.push({ termMonths, reason: result.reason });
      continue;
    }
    const q = result.quote;
    comparison.rows.push({
      termMonths,
      band: q.band,
      monthlyNetCents: q.monthlyNetCents,
      monthlyGrossCents: q.monthlyGrossCents,
      buyoutCents: q.buyoutCents,
      buyoutGrossCents: q.buyoutGrossCents,
      totalIfReturnCents: q.totalIfReturnCents,
      totalIfBuyCents: q.totalIfBuyCents,
    });
  }
  return comparison;
}
