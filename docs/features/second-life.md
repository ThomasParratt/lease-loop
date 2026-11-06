# Second life: assessment, matchmaking and re-pricing

## What it does

A returned item is assessed: every way to relist it (as returned, or refurbished to each higher condition) with its refurbishment plan, market value, second-life price (D12) and net rent per term, then the waiting list is ranked by D13 and the item is relisted in the winner's condition at its second-life price. The admin's "Assess and relist" on `/[locale]/assets/[id]/second-life` writes it; the page is back office (D85): only the admin sees it or any link to it, because it shows the whole waiting list; the quote, the price page and the signing then price the item on that amount, and the next contract names the one before it (D16), so the passport shows the chain of lives.

## The rule

1. **Options.** For each target condition from the returned one up to like new: `refurbishmentPlan` (the data's fixed steps whose `when` holds, then the condition upgrades), the market value after it (`marketValueCents`: net list price at the first lease × curve at the age × condition multiplier after × usage adjustment on the usage since the last battery replacement after the plan (D83, the organisers’ answer of 6 Nov, 10:35: a new battery resets it to 0; the total usage never resets and stays on the asset for the passport and circular impact)), and **D12: second-life price = market value + refurbishment cost**, then the normal band and factor through `priceQuote` for every allowed term (D43), no down payment.
2. **Verdicts (D62).** Each entry of the waiting list, the first failing step named as a code: `other_category`, `already_matched` (an earlier assessment won it), `expired` (`needed_by` before the assessment day), `term_not_offered`, `condition_unreachable`, `rent_not_priced`, `over_budget { shortCents }`, else `candidate`. An entry is offered the lowest condition that satisfies it: max(as returned, its minimum, fair).
3. **Ranking (D13).** No refurbishment beyond the mandatory steps first, then the earliest `needed_by`, then the highest total rent over the term (rent × term), then the lower id. Each row names the step that put it below the row above.
4. **Decision (D61).** Relist in the winner's condition; with no winner, at good (or as returned when better). The mandatory steps are always done.

### Card 9: `ebike-007`, fair, 18 400 km, assessed on 2026-11-06

- **Value inputs (D60).** One past life, no contract in our books: the earliest list price, 549 000 (v1), aged by D11 from January 2023: 46 months. The e-bike curve between 36 (40 %) and 48 (31 %) gives 40 − 9 × 10/12 = **32.5 %**.
- **The plan, as returned:** battery 35 000 (18 400 ≥ 15 000 km since the last battery; the pack records none, so that is the total) + safety inspection 4 500 = **39 500**. To good: + fair→good 12 000 = **51 500**. To like new: + good→like new 8 000 = 59 500.
- **Two usage counters (D83).** The total, 18 400 km, never resets: the relisted bike keeps it, the passport shows it and the next exit must report at least it. The usage since the last battery is 0 after the plan; it is what the value's usage adjustment counts and what the next battery waits for (15 000 km more, so at 33 400 km on the odometer).
- **Market value (D83, the organisers' worked example):** before the battery 549 000 × 32.5 % × 0.65 × 0.80 (−20 % cap) = 92 781; with the new battery fair × 1.00 = **115 976** (1 159,76 €); good × 0.85 × 1.00 = **151 661**; like new × 0.95 = 169 504.
- **D12 price:** fair 115 976 + 39 500 = **155 476** (band A); good 151 661 + 51 500 = **203 161** (band B); like new 229 004 (band B).
- **Rents:** fair (band A) **8 710** for 12 months (24: 5 696, 36: 4 451, 48: 3 723); good (band B) **7 219** for 24 months (12: 11 133); like new (band B) 6 317 for 36 months.
- **Refurbish or not, the organisers' comparison.** To good the value gains 151 661 − 92 781 = 58 880 against 51 500 of work (35 000 + 12 000 + 4 500); the battery alone gains 23 195 for 35 000, but it is a mandatory step at 15 000 km. Whether to go beyond the mandatory steps is still D61's: the winner's condition.
- **The waiting list (e-bikes):**

| Entry   | Wants                   | Offered at | Rent   | Verdict              | Rank and step                              |
| ------- | ----------------------- | ---------- | ------ | -------------------- | ------------------------------------------ |
| wait-02 | fair, 12 m, ≤ 9 000     | fair       | 8 710  | candidate            | 1, winner                                  |
| wait-13 | good, 24 m, ≤ 9 000     | good       | 7 219  | candidate            | 2, needs refurbishing (`no_refurbishment`) |
| wait-04 | good, 24 m, ≤ 12 000    | good       | 7 219  | candidate            | 3, needed later (`needed_by`)              |
| wait-03 | like new, 36 m, ≤ 6 000 | like new   | 6 317  | over budget by 317   |                                            |
| wait-01 | good, 24 m, ≤ 4 500     | good       | 7 219  | over budget by 2 719 |                                            |
| wait-05 | good, 12 m, ≤ 3 500     | good       | 11 133 | over budget by 7 633 |                                            |

- **The answer.** Refurbish? **No**, only the mandatory battery and inspection (39 500). Who? **`wait-02`**: both twins fit the budget and need it by 2026-11-10, but `wait-02` takes it as returned and `wait-13` needs 12 000 more of work, so D13's first step decides. D83 moved the numbers, not the winner: the rents rose (7 411 → 8 710, 6 332 → 7 219) and both twins are still under 9 000; only `wait-03` drops out. At what rent? **8 710 net a month for 12 months** (87.10 €, 109.31 € with 25.5 % VAT), on a second-life price of 1 554.76 €. A quote at 12 months on the relisted item gives exactly 8 710.

### Card 10: `ebike-008`, two past lives, good, 9 800 km

- 179 900 (v1) × 26 % (58 months, between 48 = 31 % and 60 = 25 %) × 0.85 × 82 % (9 steps of 1 000 km, −18 %) = 32 601.48 → **32 601**; the plan is the inspection only (9 800 < 15 000 km): **4 500**; D12 price **37 101** (band A). Good is acceptable for the catalogue, so it stays good; the waiting list ranks `wait-05` first (needed by 2026-11-08).
- **A waiting-list entry is not a customer** (the pack gives it no customer id or answers), so the card's "lease it again" is any customer's lease of the relisted bike (D67); the test leases it to `cust-olavi`, whose story is the bike, for 24 months, the term whose CO₂ the card names. The match says `wait-05` would be offered it first, at 12 months.
- Leased again for 24 months (quote and sign on 2026-11-06): 37 101 × 0.036637 = 1 359.27 → **1 359** net a month.
- **The passport** at the end of the term: three lives, two estimated at 24 months each and the third dated at 24 months; the assessed, refurbished and repriced events sit between the second and third life. **CO2 (D15):** 0 + 29 + 29 = **58 kg** (each later 24-month life saves the e-bike footprint × (1 − refurbishment share) × 24 / 120).

## Decisions

D12 (re-pricing), D77 (the inspection wins over the report), D13 (matchmaking), D15 (CO2), D16 and D66 (the contract chain), D22 and D23 (`returned` → `available`, statuses parsed before the write), D31 and D60 (the price and age the value starts from), D61 (refurbish or not, the floor), D62 (the budget test), D63 (where the price lives), D64 (the admin button, not an event handler), D65 (an assessment without a contract), D67 (a relisted fair item is open to anyone), D83 (two usage counters: the total never resets, the usage since the last battery takes the value's usage adjustment and the next battery; replaces D79, which had replaced D68), D85 (the page is back office: admin only).

## Pure functions

- `assessReturn(input, { curves, costs, pricing })` in `src/domain/second-life/assess.ts`. In: asset id, category, returned condition and total usage, the total at the last battery replacement (`usageAtLastReset`, D83; absent: none), the curve-age input (D11/D31), the new price (D60), the ISO day. Out: `{ assetId, category, isoDate, ageMonths, returnedCondition, options[] }`, each option `{ condition, upgrade, plan, marketValue, secondLifeFinancedCents, rents[{ termMonths, monthlyNetCents | null, band, refusal }] }`.
- `matchDemand(assessment, demand)` in `src/domain/second-life/match.ts`. Out: `{ verdicts[{ demandId, neededBy, outcome: { code, params } }], ranking[{ …, rank, decidedBy }], winner, decision: { code, params }, relist }`.
- `firstLeaseCurve({ assetId, modelYear, previousLives, contracts, priceLists, today }) → { listPriceCents, age } | null` and `livesSoFar(packPreviousLives, contracts) → { previousLives, currentLife }` in `src/domain/second-life/first-lease.ts`: D60 in one place, read by the assessment and the exit (review findings 1 and 3); `firstLeaseListPriceCents` lives there too (re-exported from `assess.ts`). `withSecondLifePrice(pricing, assetId, cents)` in `assess.ts`.
- **The inspection (D77).** `POST /api/assets/[id]/assessments` takes an optional body `{ condition?, usageValue? }`: the admin's inspection, assessed and relisted on instead of the reported values the exit stored; no body assesses the stored values, as the assess button does. A per-block service (the farm machine's) counts from the usage of the newest assessment that did it.
- **The usage since the last battery (D83)** in `src/domain/refurbishment/plan.ts`: `usageSinceReset(total, atLastReset) → number` (none on record is the total; a total below the reading counts from 0) and `usageAtLastReset(assessments, category, costs) → number` (the usage of the newest assessment whose plan did a `resets_usage` step, else 0). `refurbishmentPlan` takes `usageAtLastReset` and returns `usageAfter` (the total, unchanged) and `usageSinceResetAfter` (0 when a step resets it). Stored as no column: the assessment rows already record each replacement.

## Files

- `src/domain/second-life/assess.ts`, `match.ts` and their tests.
- `src/server/second-life.ts` (`assessAsset`, `previewAssessment`, `latestAssessment`, `toAssessmentResponse`), `src/server/second-life-price.ts` (`pricingForAsset`, read by `quotes.ts`, `contracts.ts`, the preview route and the price page), `src/server/second-life-schemas.ts`.
- `src/app/api/assets/[id]/assessments/route.ts` (`POST`, admin, 201) and its row in `src/server/routes.ts`; `docs/openapi.json`.
- `src/app/[locale]/assets/[id]/second-life/page.tsx` and `assess-button.tsx`; `src/server/second-life-page.ts` (`readSecondLifePage`: `read_second_life` authorized before anything is read, D85). The note and link on `src/app/[locale]/assets/[id]/page.tsx`. While an item waits as returned, the admin also finds the second-life page linked from its greyed card in the catalogue (`src/components/model-card.tsx`), its passport and the ended contract's exit notice (`src/components/contract-exit.tsx`), so the assessment is reached without the demo button; a customer sees none of these links (D85).
- `prisma/schema.prisma` and the migration `second_life_assessment` (D65); `src/domain/rows/return-assessment.ts`.

## Tests that pin the numbers

- `src/domain/second-life/assess.test.ts`: 46 months, 32.5 %, 39 500 / 51 500, 115 976 / 151 661, 155 476 / 203 161, the rents per term; "the organisers' example" pins their three numbers (92 781 before the battery, 115 976 with it, 151 661 also good) and a bike back at 30 000 km after a battery at 18 400 (no new battery, the 11 600 km since count); a cheaper cost table, a first-life item (D31), an unfinanceable item, a laptop's terms.
- `src/domain/refurbishment/plan.test.ts`: the next battery at 15 000 km (e-bike) and 500 cycles (laptop) since the last one, a replaced meter, `usageSinceReset`, `usageAtLastReset` (D83).
- `src/domain/second-life/match.test.ts`: wait-02 wins at 8 710, wait-13 second by `no_refurbishment` at 7 219, wait-03 over budget by 317; without wait-02, wait-13 by `needed_by` and refurbished to good; no demand in the category; one cent short; equal but id; total rent; another demand list; a poor item never relisted poor; an expired entry (card 9 on 11-11, card 10 on 11-09: `wait-13` wins ebike-008); an entry already matched.
- `src/domain/scenarios/card-09-second-life.test.ts`: the five card 9 steps, no todos left.
- `src/server/scenarios/card-09.test.ts`: on a migrated database, the preview writes nothing; the assessment row, the events, the asset available fair at 18 400 km (D83: the total stays); a quote at 12 months is 8 710 on 155 476 with the live list's version; back again at 20 200 km: no battery, the 1 800 km since cost one 2 % step (113 657); admin only, returned only; an entry matched to another item is passed over; an unreadable stored row reads as none.
- `src/server/scenarios/card-10.test.ts`: ebike-008 assessed (37 101, wait-05), leased for 24 months at 1 359, three lives and 58 kg; card 1's bike returned, assessed and leased again with `previous_contract_id`.
- `src/domain/scenarios/traps.test.ts`: the twin pairs through `matchDemand`: `wait-02` over `wait-13` (`no_refurbishment`), `wait-06` over `wait-14` (`id`) on `laptop-006`.
- `src/domain/scenarios/drills.test.ts`: a returned laptop (data wipe, battery at 500 cycles, `wait-08`), a waiting list nobody fits (each verdict's failing step, relisted at good), an entry already matched.
- `src/server/scenarios/returned-through-exit.test.ts`: an item leased and ended through the app's own exit, previewed as the page does and assessed through `POST /api/assets/[id]/assessments` as the admin: card 1's `ebike-003` back at the end of term (35 months, its own list price, Life 2 in the catalogue, quotable again), on the day it was signed (age 0, no match) and early and worn (fair, 2 500 km); `laptop-001` and `farm-001`; passed on (assessed like a return) and bought (409 `asset_not_returned`, status `sold`); a second return and a third life (23 months from the first lease, three lives on the passport, money per life).
- `src/server/second-life-page.test.ts`: D85, the admin reads card 9's preview; a customer, another customer, an unknown actor and anonymous are refused with no waiting-list data, whatever the id.
- `src/server/demo-cards.test.ts`: cards 9 and 10 from the demo button: 155 476 and `wait-02` at 8 710; 37 101 leased at 1 359, three lives, 58 kg; a second click refused.

## The bug report of 2026-11-06 (not reproduced)

A tester reported the second-life page broken and "Assess and relist" failing for an item returned through the app's own exit (leased, then "Give it back"). On a migrated database neither reproduces: every e-bike and laptop in the pack, leased and returned on the day it was signed, seven months in and at the end of term, as reported or worn, previews and assesses through the route as the admin (201); the regression tests above pin that path. The tester's dev server logged `The column main.AuditLog.prev_hash does not exist in the current database` (P2022): the audit signing (D81, #69) added columns, and a database not migrated after the pull fails every audited write, the assessment included. **If a page errors on a missing column after pulling, run `npx prisma migrate deploy` and restart the dev server.**

## Open questions

- D60 for seeded items assumes v1 is the price as new; the pack has no first-lease date or price. Asked as question 3 in [mentor-questions.md](../mentor-questions.md).
- The assessment is made on the button; a `UNIT_RETURNED` handler could make it automatic (D64).
- `wait-06` and `wait-14` (the laptop twins) differ only in their sign-up day, which the data does not hold; D13 then falls back to the lower id, `wait-06`, which matches the brief's answer.
- A later life gets the same category cap as a first lease (D43: `allowedTerms` in `assess.ts`, `matchDemand`); whether it should get a shorter one (an old item on a 48-month lease outlives its design life) is still open.
