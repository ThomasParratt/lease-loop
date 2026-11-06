// Nothing throws, and every outcome is one the page can write: for a random customer × asset ×
// term × quantity × down payment on the real data pack, the flow either refuses the quote with
// a known code or decides with known reason codes whose message keys exist in all four
// languages. The seed is fixed and the run count bounded, so the test is the same every time.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/messages/en.json';
import et from '@/i18n/messages/et.json';
import fi from '@/i18n/messages/fi.json';
import sv from '@/i18n/messages/sv.json';
import { listPriceOn } from '../price-list';
import { termsOf } from '../pricing/quote';
import { applicationDecisions } from '../statuses';
import { applyFor, pack } from './fixtures';

const SEED = 20261105;
const NUM_RUNS = 1_500;
const TIMEOUT_MS = 60_000;
const DAY = '2026-11-05';

const QUOTE_REFUSALS = [
  'invalid_quantity',
  'invalid_down_payment',
  'unknown_term',
  'term_over_category_max',
  'unknown_asset',
  'no_price_list_on_date',
  'down_payment_too_high',
  'below_minimum',
  'above_maximum',
  'no_vat_rate_on_date',
];

const dictionaries = { en, fi, sv, et } as Record<string, Record<string, string>>;
const keyInEveryLanguage = (key: string) =>
  Object.values(dictionaries).every((dictionary) => typeof dictionary[key] === 'string');

/** The down payments the brief names: none, one cent, one cent short of the price, the price. */
const downPaymentFor = (listPriceCents: number, kind: 0 | 1 | 2 | 3) =>
  [0, 1, listPriceCents - 1, listPriceCents][kind]!;

const dealArb = fc.record({
  customer: fc.constantFrom(...pack.customers),
  assetId: fc.constantFrom(...pack.assets.map((a) => a.id)),
  termMonths: fc.constantFrom(...termsOf(pack.table)),
  quantity: fc.integer({ min: 1, max: 5 }),
  downKind: fc.constantFrom(0, 1, 2, 3) as fc.Arbitrary<0 | 1 | 2 | 3>,
});

describe('the question flow on random deals (property)', () => {
  it(
    `every customer × asset × term × quantity 1–5 × four down payments decides or refuses with known codes (seed ${SEED})`,
    () => {
      fc.assert(
        fc.property(dealArb, ({ customer, assetId, termMonths, quantity, downKind }) => {
          const unit = listPriceOn(pack.priceLists, assetId, DAY);
          if (!unit.ok) throw new Error(`no list price for ${assetId} on ${DAY}`);
          const listPriceCents = unit.priceCents * quantity;
          const downPaymentCents = downPaymentFor(listPriceCents, downKind);
          const app = applyFor(customer, {
            assetId,
            quantity,
            termMonths,
            downPaymentCents,
            isoDate: DAY,
          });

          if (!app.ok) {
            // a persona's answers fill every question, so the only stop is the quote itself
            expect(app.step, `${customer.id} ${assetId}`).toBe('quote');
            if (app.step !== 'quote' || app.quote.ok) throw new Error('refused without a reason');
            expect(QUOTE_REFUSALS).toContain(app.quote.reason.code);
            return;
          }
          expect(applicationDecisions).toContain(app.result.decision);
          expect(keyInEveryLanguage(`decision.status.${app.result.decision}`)).toBe(true);
          expect(app.result.reasons.length).toBeGreaterThan(0);
          for (const reason of app.result.reasons) {
            expect(keyInEveryLanguage(`decision.reason.${reason.code}`), reason.code).toBe(true);
            for (const value of Object.values(reason.params)) {
              expect(['string', 'number']).toContain(typeof value);
              if (typeof value === 'number') expect(Number.isSafeInteger(value)).toBe(true);
            }
          }
          // the financed amount in the decision is the quote's, whole cents within the table
          expect(Number.isSafeInteger(app.context.financedCents)).toBe(true);
          expect(app.context.financedCents).toBeGreaterThan(0);
        }),
        { seed: SEED, numRuns: NUM_RUNS, endOnFailure: true }
      );
    },
    TIMEOUT_MS
  );

  it('the four down payments cover the price edge: 0, 1, price − 1 and the price itself', () => {
    expect([0, 1, 2, 3].map((k) => downPaymentFor(389_000, k as 0 | 1 | 2 | 3))).toEqual([
      0, 1, 388_999, 389_000,
    ]);
  });
});
