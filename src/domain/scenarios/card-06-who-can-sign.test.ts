// Card 6, who can sign: Norvi Logistics leases four `ebike-004` in one contract. Financed
// together they fall in band C, cheaper than four band-B leases; the coordinator who applies
// may not sign, so the application waits for the named signatory.
import { describe, expect, it } from 'vitest';
import { applyFor, customerById, quoteFor } from './fixtures';

const fleet = { assetId: 'ebike-004', quantity: 4, termMonths: 36, isoDate: '2026-11-05' };

describe('card 6: who can sign (Norvi, 4 × ebike-004, 36 months)', () => {
  it('four together: 2 196 000 financed, band C at 26 864 millionths, rent 58 993', () => {
    const q = quoteFor(fleet);
    expect(q.ok && q.quote).toMatchObject({
      unitListPriceCents: 549_000,
      financedCents: 2_196_000,
      band: 'C',
      factorMillionths: 26_864,
      monthlyNetCents: 58_993,
    });
  });

  it('the rent splits over the four without losing a cent: 14 748 × 3 + 14 749', () => {
    const q = quoteFor(fleet);
    expect(q.ok && q.quote.perUnit?.monthlyNetCents).toEqual({
      shareCents: 14_748,
      remainderCents: 1,
    });
  });

  it('one alone is band B at 15 144, so the fleet saves 4 × 15 144 − 58 993 = 1 583 a month', () => {
    const one = quoteFor({ ...fleet, quantity: 1 });
    expect(one.ok && [one.quote.band, one.quote.monthlyNetCents]).toEqual(['B', 15_144]);
    expect(4 * 15_144 - 58_993).toBe(1_583);
  });

  it('asks who can sign and for the signatory, then decides awaiting_signatory', () => {
    const app = applyFor(customerById('cust-norvi'), fleet);
    if (!app.ok) throw new Error('the flow did not complete');
    expect(app.askedIds).toEqual(expect.arrayContaining(['q_can_sign', 'q_signatory_email']));
    expect(app.result).toEqual({
      decision: 'awaiting_signatory',
      reasons: [
        { code: 'signatory_needed', params: { signatoryEmail: app.answers.q_signatory_email } },
      ],
    });
  });
});
