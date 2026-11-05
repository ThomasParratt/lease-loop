# Pricing and quotes

Spine steps 1 and 2 of `CHALLENGE.md`, smart problem 6 ("Explain my price") and scenario cards 1, 2, 6 and 7.

## What it does

The price page shows what an item costs a month for any term, down payment and quantity, line by line from the list price to the total cost, and compares the four terms side by side. "Apply at this price" freezes that price for 14 days at its date and price-list version and opens the application, so a later price list never changes it.

In detail:

- **The price page** `/[locale]/assets/[id]`: the asset, a term slider (12/24/36/48 months), a down-payment slider (0 to the price, in steps of 1 % of the price rounded to whole euros) and a quantity field (1–20). The monthly price updates live from `GET /api/quotes/preview`; the browser never computes a price.
- **The breakdown**, as a definition list in plain words: price of the item (and of N items), what you pay at the start, the amount we finance, the band and factor, the monthly rent without VAT, the VAT and what you pay each month, the per-item share for a fleet, the buyout at the end, and the total cost two ways (if you give it back, if you keep it).
- **The term comparison**: the same choices priced at every term, side by side, with the terms that cannot be priced and why.
- **The stored quote** (D7, revised): "Apply at this price" stores a `Quote` row priced on the request's day, valid 14 days, with an audit row, and opens the application (`/[locale]/apply/[quoteId]`, the question-flow slice's page), which shows "Price locked until" its last valid day while the quote is valid. `?quote=<id>` on the price page still shows a stored quote with a notice when a cheaper list is live today (card 2), but nothing links to it any more.
- **The catalogue's offer** (`financeOffer`): the limits apply to the amount financed, not to the item. An item above the highest band is offered with the down payment that leaves exactly the maximum to finance: `farm-006` at 260 000 € gets "with 10 000 € down", financed 250 000 € in band D, and its card opens the price page with `?down=1000000`, the breakdown open. An item below the lowest band stays refused with the reason (`ebike-010` at 289 € on price list 1; 303 € and an ordinary offer on price list 2 from Friday). Offering several units of it is left to D8.
- **The page:** the item and the price panel side by side from 768 px; the tag shows the monthly price, the total for the term and the buyout with VAT; the breakdown and the term comparison open on click, the comparison leading with the monthly price and one line on why a longer term costs more in total.
- **Refusals are codes with params** (rule 6): `invalid_quantity`, `invalid_down_payment`, `unknown_term`, `unknown_asset`, `no_price_list_on_date`, `down_payment_too_high`, `below_minimum`, `above_maximum`, `no_vat_rate_on_date`, and from the stored quote `asset_not_available`. The page writes them from `pricing.refusal.*` in the visitor's language, with amounts formatted as euros.

## The rule

```text
list price       = net list price of one unit on the day × quantity          (price list in force that day)
financed         = list price − down payment                                  (D8; down payment < list price)
band, factor     = coefficient table row for the financed amount, column for the term
monthly net      = financed × factorMillionths / 1 000 000, rounded half up   (D1, applyMillionths)
monthly VAT      = monthly net × rate in basis points / 10 000, half up        (D1, rounded from the net, per line)
monthly gross    = monthly net + monthly VAT
buyout           = financed × buyout % of the term, half up                     (15 % at 36 months)
down, buyout VAT = down payment, buyout × the same rate, half up, per line        (like invoice 0 and the buyout invoice)
total if return  = gross down payment + term × monthly gross                    (D6)
total if buy     = total if return + gross buyout                               (D6)
```

The VAT in the totals is the quote day's rate and is labelled an estimate: VAT is charged at each invoice's date (D2), so the fictional 26 % from 1 Jan 2027 moves the later rents of a lease that crosses it. The down payment and the buyout are listed net (as the data pack gives them) with their with-VAT amount beside them, and the totals use the with-VAT amounts, so a total is what the invoices add up to while the rate stays the same.

### Card 1, line by line (`ebike-003`, 36 months, no down payment, 5 Nov 2026)

| Line                   | Number                                                     |
| ---------------------- | ---------------------------------------------------------- |
| List price (v1)        | 389 000                                                    |
| Financed               | 389 000 − 0 = 389 000 → band B                             |
| Factor (B, 36)         | 0.027584 → 27 584 millionths                               |
| Monthly net            | 389 000 × 27 584 / 10⁶ = 10 730.18 → **10 730**            |
| VAT 25.5 %             | 10 730 × 2550 / 10⁴ = 2 736.15 → **2 736**                 |
| Monthly gross          | **13 466**                                                 |
| Buyout (15 %)          | **58 350**                                                 |
| Total if you return it | 36 × 13 466 = **484 776**                                  |
| Buyout VAT             | 58 350 × 25.5 % = 14 879.25 → **14 879**; gross **73 229** |
| Total if you buy it    | 484 776 + 73 229 = **558 005**                             |

### Card 6, four bikes (`ebike-004`, 36 months)

One `ebike-004` is 549 000: band B, 549 000 × 0.027584 = 15 143.6 → **15 144** a month. Four are financed as one amount (D8): 4 × 549 000 = **2 196 000**, which crosses the band C floor (1 000 000), so the factor drops to 0.026864 and the rent for the four is 2 196 000 × 0.026864 = 58 993.3 → **58 993** (14 748.25 a bike, against 15 144 alone). The per-unit split never loses a cent: 58 993 = 4 × 14 748 + 1, and the breakdown says one item carries the extra cent.

### Card 7, the half cent (`farm-002`, 48 months, 2 000 000 down)

14 500 000 − 2 000 000 = **12 500 000** financed, band D, factor 0.021763: 12 500 000 × 21 763 = 272 037 500 000, / 10⁶ = **272 037.5** exactly. Half up gives **272 038**. Floating-point euros would get this wrong; the integer division with a remainder test cannot. Buyout 8 % = **1 000 000**.

### Card 2, the locked price (`laptop-004`, band B, 36 months)

On 5 Nov 2026 list v1 is 349 000 → 9 627 a month. On 6 Nov list v2 is 321 100 → 8 857. A quote made on 5 Nov and opened on 6 Nov still shows 9 627, list v1 and its date: the stored numbers are frozen and `getQuote` rebuilds the breakdown from them without re-pricing. `quoteStatusOn` sees that v2 is live and cheaper and the page says so, with a link to price it again today.

## Decisions

- **D1** rounding: half up to the cent, once, after integer arithmetic (`applyMillionths`, `percentOf`). Implemented as proposed.
- **D6** total cost: two totals, "if you return it" and "if you buy it". Implemented as proposed.
- **D7** the quote: a stored record with date, list version, band, factor, rent, buyout and the VAT rate at quote, valid 14 days (`valid_until = quote_date + 14`, that day included). Implemented as proposed.
- **D8** quantity: financed = list × quantity − down, band on the total, one quote, per-unit split. Implemented; the mentor question stays open.
- Not in the decisions file yet, chosen here: the per-unit split puts the leftover cents on the first units (`splitEvenly`) instead of rounding each share; an asset that is not `available` (the reserved `ebike-009`) shows its price but cannot be quoted (`asset_not_available`).

## Pure functions (`src/domain/pricing/`)

```ts
priceQuote(data: PricingData, input: QuoteInput): QuoteResult
  // PricingData = { priceLists, table, vatRates }
  // QuoteInput = { assetId, quantity, termMonths, downPaymentCents, isoDate }
  // QuoteResult = { ok: true; quote: QuoteBreakdown } | { ok: false; reason: QuoteRefusal }
breakdownFromFrozen(frozen: FrozenQuote): QuoteBreakdown   // the stored numbers → every derived line
compareTerms(data: PricingData, input: Omit<QuoteInput, 'termMonths'>): TermComparison
quoteStatusOn(quote: QuoteForStatus, today: string, priceLists): QuoteStatus
termsOf(table): number[]
splitEvenly(totalCents: number, parts: number): UnitSplit
addDays(isoDay: string, days: number): string   // re-exported from src/domain/civil-days.ts, shared with invoicing
QUOTE_VALID_DAYS = 14
```

Server (`src/server/quotes.ts`): `loadPricingData()`, `createQuote(db, { assetId, quantity, termMonths, downPaymentCents, today, actor }, data?)`, `getQuote(db, id)`, `storedQuoteStatusOn(stored, today, priceLists)`, `previewQuote(data, { …, today })`.

## Files

| File                                    | What                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `src/domain/pricing/quote.ts`           | `priceQuote`, `breakdownFromFrozen`, `splitEvenly`          |
| `src/domain/pricing/compare.ts`         | `compareTerms`                                              |
| `src/domain/pricing/quote-status.ts`    | `quoteStatusOn`                                             |
| `src/domain/civil-days.ts`              | `addDays`, no clock, shared with invoicing                  |
| `src/domain/pricing/index.ts`           | the public exports and `QUOTE_VALID_DAYS`                   |
| `src/server/quotes.ts`                  | the stored quote, the preview                               |
| `src/server/quote-schemas.ts`           | the Zod schemas of the three routes (rows in `routes.ts`)   |
| `src/app/api/quotes/route.ts`           | `POST /api/quotes`                                          |
| `src/app/api/quotes/preview/route.ts`   | `GET /api/quotes/preview`                                   |
| `src/app/api/quotes/[id]/route.ts`      | `GET /api/quotes/[id]`                                      |
| `src/app/[locale]/assets/[id]/page.tsx` | the price page and the locked quote                         |
| `src/components/quote-calculator.tsx`   | the sliders and the term table (client)                     |
| `src/components/quote-breakdown.tsx`    | the breakdown list and the refusal text (server and client) |

## Tests that pin the numbers

| Number                                                                                    | Test                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card 1: B, 27 584, 10 730, 2 736, 13 466, 58 350, both totals                             | `quote.test.ts` "card 1"; `compare.test.ts` row 36; `quotes.test.ts` stored row                                                                                |
| Card 2: 349 000 → 9 627, 321 100 → 8 857, locked, v2 cheaper                              | `quote.test.ts` "card 2"; `quote-status.test.ts`; `quotes.test.ts` "getQuote, card 2"                                                                          |
| Card 6: 2 196 000, band C, 58 993; one alone B 15 144; the split                          | `quote.test.ts` "card 6"; `quotes.test.ts` "card 6"                                                                                                            |
| Card 7: 12 500 000, band D, 272 038, buyout 1 000 000                                     | `quote.test.ts` "card 7"                                                                                                                                       |
| `laptop-002` A, `laptop-003` B; `ebike-010` below; `farm-006` above                       | `quote.test.ts` "the traps"                                                                                                                                    |
| Quantity 0, down = price, bad term, unknown asset, no list, no VAT                        | `quote.test.ts` "the traps"                                                                                                                                    |
| Valid until 2026-11-19, expired on the 20th, leap days                                    | `days.test.ts`, `quote-status.test.ts`                                                                                                                         |
| Reserved `ebike-009` cannot be quoted; nothing written on refusal                         | `quotes.test.ts`                                                                                                                                               |
| Cards 1, 2, 6, 7, the band edges and the table limits on the data pack (scenario harness) | `src/domain/scenarios/card-01-happy-path.test.ts`, `card-02-price-lock.test.ts`, `card-06-who-can-sign.test.ts`, `card-07-big-ticket.test.ts`, `traps.test.ts` |

## Open questions

- **D8, for the mentors:** is "4 ×" in card 6 meant as one financed amount (band C, our reading) or four separate leases (band B each)? Every asset in the pack is one serialised unit and there is one `ebike-004`; this slice prices the fleet and does not assign units (that is the contract's job). The catalogue has one row per asset id, so a quote for four `ebike-004` checks only that one row is `available`, and a contract that locks the asset would lock that one row for all four units. Before the contract slice builds on it, confirm whether D8 means N units on one asset row or N rows (one per serialised unit), which would need a unit table or a quantity per asset.
- Settled in review (PR #11): the totals put VAT on the down payment and the buyout at the quote-date rate, so they match the invoices (card 7: 510 000 of VAT on the 2 000 000 down payment, 255 000 on the 1 000 000 buyout).
- The quote shows the totals at the quote-day VAT rate. A lease that crosses 1 Jan 2027 will invoice later months at 26 %; the invoicing slice owns that, and the quote's note says the totals are an estimate.

## Added with the catalogue page (PR #23)

- `financeOffer(data, { assetId, termMonths, isoDate }): FinanceOffer` in `src/domain/pricing/financeable.ts`: `standard` (one unit, nothing down), `needs_down_payment` (the excess over the maximum, with its quote) or `none` (the refusal). Tests: `financeable.test.ts` (the combine's 10 000 €, the kids bike refused on Thursday and priced on Friday, a refusal passed on).
- `compareTerms` rows also carry `buyoutGrossCents` (the buyout with VAT at the quote day's rate), pinned at 73 229 for card 1 in `compare.test.ts`.
