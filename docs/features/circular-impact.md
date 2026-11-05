# Circular impact and the passport

## What it does

Every item has a passport: its lives across leases, with dates, months, contract and what happened between lives (assessed, refurbished, repriced). Each later life is credited with the CO2 it avoided, per item on the passport page and for the whole fleet in the catalogue's impact strip (smart problem 7, problem 3's passport bonus, scenario card 10).

## The rule: the method, worked through card 10

A later life avoids the manufacturing of a new item, minus what refurbishing cost, spread over the months the item is built to last and counted for the months that life used:

```
saved = footprint × (1 − refurbishment share) × months counted ÷ design life months
months counted = min(months of the life, design life − months all earlier lives used)
```

The first life earns nothing (the item was made for it). Every life, the first included, uses up design life.

Card 10, `ebike-008` (`data/assets.json`: e-bike, `previous_lives: 2`):

| Input                      | Value                                                    | Source                                 |
| -------------------------- | -------------------------------------------------------- | -------------------------------------- |
| Manufacturing footprint    | 165 kg CO2e                                              | `data/co2-factors.json`                |
| Refurbishment share        | 12 % → net 145.2 kg per whole design life                | `data/co2-factors.json`                |
| Design life                | 120 months (1.21 kg per month of later life)             | `DESIGN_LIFE_MONTHS` (team assumption) |
| Months of the 2 past lives | 24 each, estimated (the data pack has no dates for them) | `ASSUMED_PAST_LIFE_MONTHS`             |
| Third life                 | leased on the demo day; 24-month term                    | the event log                          |

| Life       | Months | Design life used before | Saved                         |
| ---------- | ------ | ----------------------- | ----------------------------- |
| 1 (past)   | 24     | 0                       | 0 kg (first life)             |
| 2 (past)   | 24     | 24                      | 145.2 × 24 / 120 = 29.04 → 29 |
| 3 (logged) | 24     | 48                      | 145.2 × 24 / 120 = 29.04 → 29 |
| **Total**  |        |                         | 58.08 → **58 kg**             |

On the signing day the third life has 0 months and the passport shows 29 kg; the total grows as the lease runs (an open life counts its months to the demo-clock day).

**A worn-out item earns nothing more.** If `ebike-008`'s lives had already used the 120 months, a third life of any length earns 0 kg. A life longer than what is left is capped: after 48 months used, a 96-month third life counts only 72 months, 87.12 → 87 kg.

**Rounding.** Everything is computed in grams, unrounded, and rounded once, half up, to whole kg where it is shown (`gramsToKg`). An item's total is rounded from its unrounded grams; the fleet total is the sum of the rounded category rows, so the breakdown adds up.

**Money saved is not shown**: `co2-factors.json` has no money factor, and the page says so. The e-bike's avoided car km factor is not used either: the data pack's usage is a lifetime total, not per life.

### How lives come from the event log

`AssetEvent` rows are read in id order (the order they were written), never re-sorted by date, so two events on one day keep their order.

- `leased` opens a life (start = the event day, contract id from the event). A `leased` while a life is still open closes that life on the same day.
- `returned`, `bought`, `passed_on` close the open life (end = the event day, inclusive). A closing event with no open life is kept in the gap, not dropped.
- `assessed`, `refurbished`, `repriced` attach to the gap after the life they follow (`between`), or to `before` ahead of the first lease.
- Months are whole months counted like the invoice schedule: the start day to the day before the same day next month is one month; a start on the 31st clamps to the end of a shorter month.
- `passportFor` puts the `previous_lives` the data pack counts first, undated, 24 months each, marked `estimated`.

The rows are written by the handlers in `src/server/passport-handlers.ts`: `CONTRACT_SIGNED` → `leased` (on `startDate`), `UNIT_RETURNED` → `returned`, `CONTRACT_BOUGHT_OUT` → `bought`, `UNIT_PASSED_ON` → `passed_on`, inside the emitter's `withAudit` transaction.

## Decisions

Implements **D15** (`docs/decisions.md`, status: implemented as proposed). To the challenge's question, "is the saving the same when the item was almost worn out?": no. A later life is credited with the share of a new item's life it replaces, so an almost worn-out item earns almost nothing and no footprint is counted twice. Crediting a whole footprint per reuse, as the data file's hint suggests, would credit a 2-month second life the same as a 10-year one.

## Pure functions

`src/domain/second-life/co2.ts` (pure):

```ts
DESIGN_LIFE_MONTHS: Record<AssetCategory, number>          // e_bike 120, laptop 48, farm_machine 144
ASSUMED_PAST_LIFE_MONTHS = 24
co2Method(factors: Co2Factors, designLifeMonths?): Co2Method
co2SavedByLife(method, { category, lifeIndex, months, monthsUsedBefore? }): number   // grams, unrounded
gramsToKg(grams: number): number                            // the one rounding rule
co2SavedForAsset(method, { category, lives: { months }[] }):
  { perLifeGrams: number[]; perLifeKg: number[]; totalGrams: number; totalKg: number }
fleetImpact(method, assets: { category, lives }[]):
  { perCategory: { category, assetsWithLaterLife, kg }[]; assetsWithLaterLife: number; totalKg: number }
```

`src/domain/passport.ts` (pure):

```ts
wholeMonths(start: string, endInclusive: string): number
livesFromEvents(events: PassportEvent[], asOf?: string): { before: PassportEvent[]; lives: Life[] }
passportFor(asset: Asset, events: PassportEvent[], asOf?: string): Passport
// Life = { index, start, end, contractId, months, endKind, estimated, between }
```

`src/server/asset-events.ts`:

```ts
appendAssetEvent(tx, { assetId, contractId?, kind, onDate, details? }): Promise<PassportEvent>
listAssetEvents(db, assetId): Promise<PassportEvent[]>
readPassport(db, assetId, asOf): Promise<{ asset, passport, co2 } | null>
readFleetImpact(db, asOf): Promise<{ fleet: FleetImpact; assets: { asset, kg }[] }>
```

`src/server/passport-handlers.ts`: `registerPassportHandlers(): () => void`, called once by `src/server/event-handlers.ts`.

## Files

- `src/domain/second-life/co2.ts`, `src/domain/passport.ts` and their tests
- `src/server/asset-events.ts`, `src/server/passport-handlers.ts`, `src/server/event-handlers.ts` and tests; `tests/helpers/contract-fixture.ts`
- `src/app/api/assets/[id]/passport/route.ts` (`GET`, row in `src/server/routes.ts`, in `docs/openapi.json`)
- `src/app/[locale]/assets/[id]/passport/page.tsx`, `src/components/impact-strip.tsx` (mounted on the catalogue), a "Passport" link on the asset card
- `passport.*` and `impact.*` keys in the four message files

## Tests that pin the numbers

- `co2.test.ts`: "an item returned after 2 of 60 months earns 2/60 of the net footprint, not the whole" (4.84 → 5 kg); "a worn-out item whose lives already used the design life earns nothing more"; "a life longer than the remaining design life is capped"; "rounds the total once, not each life"; "card 10: ebike-008, two past lives and a 24-month third life, has saved 58 kg" (`[0, 29, 29]`, 58 080 g).
- `passport.test.ts`: whole months (15 Jan → 14 Feb is one month, 31 Jan clamps), open life, two events on one day in log order, "card 10: ebike-008 shows its two past lives, undated and estimated".
- `asset-events.test.ts`: card 10 through the database (58 kg after 24 months, 29 kg on the signing day), a new item with no history, the fleet total.
- `passport-handlers.test.ts`: each event writes its row; a later handler failure rolls the row back with the audit row.

## Open questions

- **`previous_lives` after a return.** The passport reads it as the lives before the log. If the catalogue slice increments it on every return, a logged life is counted twice; agree with that slice (wave 2).
- **Design lives and the 24-month past-life estimate** are team assumptions, not data-pack numbers; ask the mentors whether they want them in the data pack.
- **Money saved**: needs a money factor the data pack does not have (e.g. the new price against the refurbishment cost from `refurbishment-costs.json`).
- No writer yet for `assessed`, `refurbished`, `repriced` (the second-life assessment slice), and nothing emits events until the contract slice imports `src/server/event-handlers.ts`.
