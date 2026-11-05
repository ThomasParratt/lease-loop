// The harness reads the same data pack the app's loaders return, and its application path
// gives the same answer as the flow's own functions for a plain case.
import { describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCo2Factors,
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadSecondLifeDemand,
  loadVatRates,
} from '@/data/load';
import { applyFor, assetById, customerById, financedLimits, pack, quoteFor } from './fixtures';

describe('the scenario fixtures', () => {
  it('are the data pack exactly as src/data/load.ts returns it', async () => {
    expect(pack.assets).toEqual(await loadAssets());
    expect(pack.priceLists).toEqual(await loadPriceLists());
    expect(pack.table).toEqual(await loadCoefficientTable());
    expect(pack.vatRates).toEqual(await loadVatRates());
    expect(pack.questions).toEqual(await loadQuestions());
    expect(pack.customers).toEqual(await loadCustomers());
    expect(pack.demand).toEqual(await loadSecondLifeDemand());
    expect(pack.co2Factors).toEqual(await loadCo2Factors());
  });

  it('find rows by id and throw on an id the pack does not have', () => {
    expect(assetById('ebike-003').category).toBe('e_bike');
    expect(customerById('cust-aino').type).toBe('consumer');
    expect(() => assetById('nope')).toThrow(/no asset nope/);
    expect(() => customerById('nope')).toThrow(/no customer nope/);
  });

  it('take the financed limits from the lowest and highest band', () => {
    expect(financedLimits).toEqual({ minCents: 30_000, maxCents: 25_000_000 });
  });

  it('price with quantity 1 and no down payment by default', () => {
    const q = quoteFor({ assetId: 'ebike-003', termMonths: 36, isoDate: '2026-11-05' });
    expect(q.ok && [q.quote.quantity, q.quote.downPaymentCents]).toEqual([1, 0]);
  });

  it('stop at the quote when it is refused', () => {
    const app = applyFor(customerById('cust-aino'), {
      assetId: 'ebike-010',
      termMonths: 36,
      isoDate: '2026-11-05',
    });
    expect(app.ok === false && app.step).toBe('quote');
  });

  it('stop at the first unanswered question', () => {
    const app = applyFor(
      customerById('cust-aino'),
      { assetId: 'ebike-003', termMonths: 36, isoDate: '2026-11-05' },
      { answers: { q_email: '' } }
    );
    expect(app).toEqual({ ok: false, step: 'incomplete', questionId: 'q_email' });
  });
});
