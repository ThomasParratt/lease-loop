# Second life: assessment, matchmaking and re-pricing

## What it does

A returned item is assessed: every way to relist it (as returned, or refurbished to each higher condition) with its refurbishment plan, market value, second-life price (D12) and net rent per term, then the waiting list is ranked by D13 and the item is relisted in the winner's condition at its second-life price. The admin's "Assess and relist" on `/[locale]/assets/[id]/second-life` writes it; the quote, the price page and the signing then price the item on that amount, and the next contract names the one before it (D16), so the passport shows the chain of lives.

## The rule

1. **Options.** For each target condition from the returned one up to like new: `refurbishmentPlan` (the data's fixed steps whose `when` holds, then the condition upgrades), the market value after it (`marketValueCents`: net list price at the first lease × curve at the age × condition multiplier after × usage adjustment after; a new battery resets the usage), and **D12: second-life price = market value + refurbishment cost**, then the normal band and factor through `priceQuote` for every allowed term (D43), no down payment.
2. **Verdicts (D62).** Each entry of the waiting list, the first failing step named as a code: `other_category`, `already_matched` (an earlier assessment won it), `expired` (`needed_by` before the assessment day), `term_not_offered`, `condition_unreachable`, `rent_not_priced`, `over_budget { shortCents }`, else `candidate`. An entry is offered the lowest condition that satisfies it: max(as returned, its minimum, fair).
3. **Ranking (D13).** No refurbishment beyond the mandatory steps first, then the earliest `needed_by`, then the highest total rent over the term (rent × term), then the lower id. Each row names the step that put it below the row above.
4. **Decision (D61).** Relist in the winner's condition; with no winner, at good (or as returned when better). The mandatory steps are always done.

### Card 9: `ebike-007`, fair, 18 400 km, assessed on 2026-11-06

- **Value inputs (D60).** One past life, no contract in our books: the earliest list price, 549 000 (v1), aged by D11 from January 2023: 46 months. The e-bike curve between 36 (40 %) and 48 (31 %) gives 40 − 9 × 10/12 = **32.5 %**.
- **The plan, as returned:** battery 35 000 (18 400 ≥ 15 000 km, usage resets to 0) + safety inspection 4 500 = **39 500**. To good: + fair→good 12 000 = **51 500**. To like new: + good→like new 8 000 = 59 500.
- **Market value:** fair 549 000 × 32.5 % × 0.65 × 100 % (usage 0 after the battery) = 115 976.25 → **115 976**; good × 0.85 = 151 661.25 → **151 661**; like new × 0.95 = 169 503.75 → 169 504.
- **D12 price:** fair 115 976 + 39 500 = **155 476** (band A); good 151 661 + 51 500 = **203 161** (band B); like new 229 004 (band B).
- **Rents:** fair 155 476 × 0.056022 = 8 710.08 → **8 710** for 12 months (24: 5 696, 36: 4 451, 48: 3 723); good 203 161 × 0.035532 = 7 218.72 → **7 219** for 24 months (12: 11 133).
- **The waiting list (e-bikes):**

| Entry   | Wants                   | Offered at | Rent   | Verdict              | Rank and step                              |
| ------- | ----------------------- | ---------- | ------ | -------------------- | ------------------------------------------ |
| wait-02 | fair, 12 m, ≤ 9 000     | fair       | 8 710  | candidate            | 1, winner                                  |
| wait-13 | good, 24 m, ≤ 9 000     | good       | 7 219  | candidate            | 2, needs refurbishing (`no_refurbishment`) |
| wait-04 | good, 24 m, ≤ 12 000    | good       | 7 219  | candidate            | 3, needed later (`needed_by`)              |
| wait-01 | good, 24 m, ≤ 4 500     | good       | 7 219  | over budget by 2 719 |                                            |
| wait-03 | like new, 36 m, ≤ 6 000 | like new   | 6 317  | over budget by 317   |                                            |
| wait-05 | good, 12 m, ≤ 3 500     | good       | 11 133 | over budget by 7 633 |                                            |

- **The answer.** Refurbish? **No**, only the mandatory battery and inspection (39 500). Who? **`wait-02`**: both twins fit the budget and need it by 2026-11-10, but `wait-02` takes it as returned and `wait-13` needs 12 000 more of work, so D13's first step decides. At what rent? **8 710 net a month for 12 months** (87.10 €, 109.31 € with 25.5 % VAT), on a second-life price of 1 554.76 €. A quote at 12 months on the relisted item gives exactly 8 710.

### Card 10: `ebike-008`, two past lives, good, 9 800 km

- 179 900 (v1) × 26 % (58 months, between 48 = 31 % and 60 = 25 %) × 0.85 × 82 % (9 steps of 1 000 km, −18 %) = 32 601.48 → **32 601**; the plan is the inspection only (9 800 < 15 000 km): **4 500**; D12 price **37 101** (band A). Good is acceptable for the catalogue, so it stays good; the waiting list ranks `wait-05` first (needed by 2026-11-08).
- **A waiting-list entry is not a customer** (the pack gives it no customer id or answers), so the card's "lease it again" is any customer's lease of the relisted bike (D67); the test leases it to `cust-olavi`, whose story is the bike, for 24 months, the term whose CO₂ the card names. The match says `wait-05` would be offered it first, at 12 months.
- Leased again for 24 months (quote and sign on 2026-11-06): 37 101 × 0.036637 = 1 359.27 → **1 359** net a month.
- **The passport** at the end of the term: three lives, two estimated at 24 months each and the third dated at 24 months; the assessed, refurbished and repriced events sit between the second and third life. **CO2 (D15):** 0 + 29 + 29 = **58 kg** (each later 24-month life saves the e-bike footprint × (1 − refurbishment share) × 24 / 120).

## Decisions

D12 (re-pricing), D13 (matchmaking), D15 (CO2), D16 and D66 (the contract chain), D22 and D23 (`returned` → `available`, statuses parsed before the write), D31 and D60 (the price and age the value starts from), D61 (refurbish or not, the floor), D62 (the budget test), D63 (where the price lives), D64 (the admin button, not an event handler), D65 (an assessment without a contract), D67 (a relisted fair item is open to anyone), D68 (the new battery in the value and in the price).

## Pure functions

- `assessReturn(input, { curves, costs, pricing })` in `src/domain/second-life/assess.ts`. In: asset id, category, returned condition and usage, the curve-age input (D11/D31), the new price (D60), the ISO day. Out: `{ assetId, category, isoDate, ageMonths, returnedCondition, options[] }`, each option `{ condition, upgrade, plan, marketValue, secondLifeFinancedCents, rents[{ termMonths, monthlyNetCents | null, band, refusal }] }`.
- `matchDemand(assessment, demand)` in `src/domain/second-life/match.ts`. Out: `{ verdicts[{ demandId, neededBy, outcome: { code, params } }], ranking[{ …, rank, decidedBy }], winner, decision: { code, params }, relist }`.
- `firstLeaseListPriceCents(priceLists, assetId)` and `withSecondLifePrice(pricing, assetId, cents)` in `assess.ts`.

## Files

- `src/domain/second-life/assess.ts`, `match.ts` and their tests.
- `src/server/second-life.ts` (`assessAsset`, `previewAssessment`, `latestAssessment`, `toAssessmentResponse`), `src/server/second-life-price.ts` (`pricingForAsset`, read by `quotes.ts`, `contracts.ts`, the preview route and the price page), `src/server/second-life-schemas.ts`.
- `src/app/api/assets/[id]/assessments/route.ts` (`POST`, admin, 201) and its row in `src/server/routes.ts`; `docs/openapi.json`.
- `src/app/[locale]/assets/[id]/second-life/page.tsx` and `assess-button.tsx`; the note and link on `src/app/[locale]/assets/[id]/page.tsx`.
- `prisma/schema.prisma` and the migration `second_life_assessment` (D65); `src/domain/rows/return-assessment.ts`.

## Tests that pin the numbers

- `src/domain/second-life/assess.test.ts`: 46 months, 32.5 %, 39 500 / 51 500, 115 976 / 151 661, 155 476 / 203 161, the rents per term; a cheaper cost table, a first-life item (D31), an unfinanceable item, a laptop's terms.
- `src/domain/second-life/match.test.ts`: wait-02 wins, wait-13 second by `no_refurbishment`; without wait-02, wait-13 by `needed_by` and refurbished to good; no demand in the category; one cent short; equal but id; total rent; another demand list; a poor item never relisted poor; an expired entry (card 9 on 11-11, card 10 on 11-09: `wait-13` wins ebike-008); an entry already matched.
- `src/domain/scenarios/card-09-second-life.test.ts`: the five card 9 steps, no todos left.
- `src/server/scenarios/card-09.test.ts`: on a migrated database, the preview writes nothing; the assessment row, the events, the asset available fair at 0 km; a quote at 12 months is 8 710 on 155 476 with the live list's version; admin only, returned only; an entry matched to another item is passed over; an unreadable stored row reads as none.
- `src/server/scenarios/card-10.test.ts`: ebike-008 assessed (37 101, wait-05), leased for 24 months at 1 359, three lives and 58 kg; card 1's bike returned, assessed and leased again with `previous_contract_id`.
- `src/domain/scenarios/traps.test.ts`: the twin pairs through `matchDemand`: `wait-02` over `wait-13` (`no_refurbishment`), `wait-06` over `wait-14` (`id`) on `laptop-006`.
- `src/domain/scenarios/drills.test.ts`: a returned laptop (data wipe, battery at 500 cycles, `wait-08`), a waiting list nobody fits (each verdict's failing step, relisted at good), an entry already matched.
- `src/server/demo-cards.test.ts`: cards 9 and 10 from the demo button: 155 476 and `wait-02` at 8 710; 37 101 leased at 1 359, three lives, 58 kg; a second click refused.

## Open questions

- D60 for seeded items assumes v1 is the price as new; the pack has no first-lease date or price. Ask the mentors.
- The assessment is made on the button; a `UNIT_RETURNED` handler could make it automatic (D64).
- `wait-06` and `wait-14` (the laptop twins) differ only in their sign-up day, which the data does not hold; D13 then falls back to the lower id, `wait-06`, which matches the brief's answer.
- Whether D43's term cap should shorten a later life (an old item on a 48-month lease outlives its design life) is still open.
