// Card 8, early exit: card 1's contract ends after month 7. What exists today is the
// schedule and the balance (D14); the early-exit price, the market value by the residual
// curve and the page are wave 2's, so they are todos with the pinned number in the name.
import { describe, expect, it } from 'vitest';
import {
  amortisationTolerance,
  buildSchedule,
  outstandingBalanceAfter,
  scheduleTotals,
} from '../invoicing';
import { pack, quoteFor } from './fixtures';

const deal = { assetId: 'ebike-003', termMonths: 36, isoDate: '2026-11-05' };
const MONTHS_PAID = 7;

function contract() {
  const q = quoteFor(deal);
  if (!q.ok) throw new Error(q.reason.code);
  const s = buildSchedule({
    signedOn: deal.isoDate,
    startDate: deal.isoDate,
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: q.quote.monthlyNetCents,
    vatRates: pack.vatRates,
  });
  if (!s.ok) throw new Error(s.reason);
  const band = pack.table.bands.find((b) => b.band === q.quote.band)!;
  return {
    quote: q.quote,
    invoices: s.invoices,
    annualInterestPercent: band.annual_interest_percent,
  };
}

describe('card 8: early exit (card 1 at month 7)', () => {
  it('the 29 rents not yet billed come to 311 170 net', () => {
    const { invoices } = contract();
    const remaining = invoices.filter((i) => i.sequence > MONTHS_PAID);
    expect(remaining).toHaveLength(29);
    expect(scheduleTotals(remaining).netCents).toBe(311_170);
  });

  it('the buyout at the end of the term is 58 350', () => {
    expect(contract().quote.buyoutCents).toBe(58_350);
    // The remaining rents plus the buyout, 369 520, are more than the balance: interest not earned.
    expect(311_170 + 58_350).toBe(369_520);
  });

  it('the balance by D14 after 7 rents is 330 675, line by line', () => {
    const { quote, annualInterestPercent } = contract();
    const balance = outstandingBalanceAfter(
      {
        financedCents: quote.financedCents,
        annualInterestPercent,
        monthlyNetCents: quote.monthlyNetCents,
        termMonths: quote.termMonths,
        buyoutCents: quote.buyoutCents,
      },
      MONTHS_PAID
    );
    expect(annualInterestPercent).toBe(7.9);
    expect(balance.balanceCents).toBe(330_675);
    expect(balance.rows).toHaveLength(7);
    expect(balance.rows.at(-1)?.closingCents).toBe(330_675);
    expect(Math.abs(balance.driftCents)).toBeLessThanOrEqual(amortisationTolerance(389_000, 36));
  });

  it.todo('the market value by the residual curve at month 7 is 311 200 (wave 2, early exit)');
  it.todo('the early-exit price is the D14 balance 330 675, shown line by line (wave 2)');
  it.todo('the early-exit invoice carries the VAT rate of its own day (wave 2)');
});
