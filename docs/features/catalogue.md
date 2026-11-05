# Catalogue, demo clock, actor and audit trail (wave 0)

## What it does

The catalogue lists the 30 assets of `data/assets.json` by category, each with its net list price on today's date, and the demo clock lets anyone move "today" to the date of a scenario card. The "continue as" picker in the header says who is acting, and every data change writes an audit row naming that actor, shown newest first on the audit page.

## The rule

- **Today's price.** The price list that applies on day `d` is the one with `valid_from ≤ d ≤ valid_to` (both days included, `valid_to: null` means open-ended); the price is that list's entry for the asset, in integer cents, VAT excluded. ISO day strings compare like the days they name, so the check is a string comparison.
  - Worked example (card 2's asset): `laptop-004` costs 349000 cents (€3,490.00) on Thu 2026-11-05, the last day of price list v1, and 321100 cents (€3,211.00, 8 % less) on Fri 2026-11-06, the first day of v2. `ebike-003` (card 1) is 389000 cents on 5 Nov.
- **Today.** `todayIso()` gives the Helsinki calendar day; a `lease-loop-as-of` cookie holding a real `YYYY-MM-DD` day overrides it (`2026-02-29` is ignored, `2028-02-29` is accepted). Pages and routes read it once per request with `todayForRequest()` and pass it down.
- **The actor.** The `lease-loop-actor` cookie holds a customer id or `admin`; anything else, or no cookie, reads as `anonymous`. Exact match, no trimming.
- **The audit trail.** `withAudit(db, entry, change)` runs the change and the audit row in one transaction: both are written or neither is.

## Decisions

D17 (the actor, no login), D21 (the palette and type). The demo clock follows the brief's wildcard (time travel); D1 rounding is not exercised yet, since list prices are shown as stored.

## Pure functions

- `listPriceOn(priceLists, assetId, isoDate)` (`src/domain/price-list.ts`) → `{ ok: true, priceCents, priceListVersion }` or `{ ok: false, reason: 'unknown_asset' | 'no_price_list_on_date' }`; throws `RangeError` on a date that is not `YYYY-MM-DD`.
- `formatEuro(cents, locale)` (`src/domain/money.ts`) → the amount as text in the visitor's locale.
- `isIsoDay(value)` → boolean; `resolveToday(systemToday, override)` → the day to use (`src/server/demo-clock.ts`).
- `actorFromCookieValue(value, knownIds)` → a customer id, `admin` or `anonymous` (`src/server/actor.ts`).

## Files

`src/app/[locale]/page.tsx` (catalogue), `src/components/asset-card.tsx`, `src/app/[locale]/demo/page.tsx` and `src/app/api/demo/clock/route.ts` (demo clock), `src/server/demo-clock.ts`, `src/server/today.ts`, `src/components/actor-picker.tsx`, `src/server/actor.ts`, `src/app/api/actor/route.ts`, `src/server/audit.ts`, `src/app/[locale]/audit/page.tsx`, `src/app/api/audit-log/route.ts`, `src/app/api/assets/route.ts`, `src/app/api/assets/[id]/status/route.ts`, `src/components/ui/*`.

## Tests that pin the numbers

- `src/domain/price-list.test.ts`: v1 up to and including 2026-11-05, v2 from 2026-11-06, open-ended v2 far ahead, no price before the first list, unknown asset.
- `src/server/demo-clock.test.ts`: real days, leap days (card 4's 29 Feb 2028), invalid overrides ignored, the cookie read.
- `src/server/actor.test.ts`: known ids, `admin`, unknown and empty values.
- `src/server/audit.test.ts`: change and row commit together; a failed audit write rolls the change back; a failed change writes no row.
- `src/components/ui/badge.test.ts`: every status has a badge colour.

## Open questions

- The catalogue shows the net list price only; the monthly price from today's price is wave 1's pricing slice.
- The demo clock needs JavaScript; `?asOf=` on the demo routes is not built (`docs/reviews/wave-0.md`, Open).
- `PATCH /api/assets/[id]/status` reads the old status outside its transaction, so two changes at once can audit a stale `from`, and it can overwrite `leased` around the signing race. Admin-only demo tool; left as is.
