# Questions for the mentors

Three readings of the brief we took in code and wanted confirmed on Friday (issues #13 and #54, and D60 from second life; #13 is answered); D31 is now a stated assumption (below). For each: what we read, what the code does today, and what changes if the answer is different. The decisions are in [decisions.md](decisions.md).

Not a question here: Thomas's question-flow validation (#25, merged) added four rules (D37 to D40: the birth-date range, answers checked against the customer record, only the named signatory signs, only the acting customer applies). They are listed for information; the scenario suite on `main` passes with them.

## 1. Fleet quantity: answered (D8, issue #13 closed)

**Answered by the organisers on 2026-11-06.** Every item is unique; card 6 is 1 × `ebike-004` and is about the signing flow; quantities and multi-item contracts are not needed. Johannes decided: no multiples in the UI or the API.

**What the code does now.** A quote prices one item: no quantity in `POST /api/quotes`, `GET /api/quotes/preview` or the price page, no per-item split. Card 6 is 549 000 financed, band B, 15 144 a month, and ends `awaiting_signatory` because the applicant may not sign. An item below the smallest lease is not leasable on that list (D78, replacing D41's "two together"). The `quantity` column stays at 1, and signing still refuses a larger one (D76) for rows stored before the answer. Our earlier reading (the band on the fleet's total, band C at 58 993) is in D8's history.

## 2. Pass on: is the next user a named person? (D16, issue #54)

**Our reading.** "Pass it on" names the next person (a friend, a colleague), who then applies in the normal way with a fresh quote at the second-life price. "Give it back" is the other exit, where matchmaking on the waiting list (D13, wave 3) finds the next customer.

**What the code does today.** The exit form asks for a customer for `pass_on` and refuses without one (`pass_on_needs_next_customer`), with yourself (`next_customer_is_self`) or with an unknown id (`next_customer_not_found`). The asset becomes `returned` and its passport records `passed_on` with the next customer ([exits.md](features/exits.md)).

**If the answer differs.** If passing on means "back to the waiting list", `pass_on` and `return` become one flow: the person picker and its three refusals go, and the next customer comes from D13's matchmaking. The billing (D14) and the passport entry stay as they are.

## 3. Second life: what price and age is a returned seeded item valued from? (D60)

**Our reading.** The residual curve starts from the item's "net list price at its first lease". An item first leased by us has that price in its first contract and is aged from that contract's start (D31). A seeded item with past lives has neither in the pack, so we take the earliest price list that lists it (the lowest version, the price as new) and age it by D11 from 1 January of its model year. A third life is never valued from its second-life contract, whose "list price" is the second-life amount.

**What the code does today.** `firstLeaseListPriceCents` in `src/domain/second-life/assess.ts` picks the price, `src/server/second-life.ts` the contract or the list. Card 9's `ebike-007` (one past life, no contract here) is valued from 549 000 (v1) at 46 months: 32.5 % on the curve, 115 976 as fair, a second-life price of **155 476** and **8 710** net a month for 12 months to `wait-02` ([second-life.md](features/second-life.md)).

**If the answer differs.** If the price list live on the assessment day is meant, `ebike-007` starts from v2's 576 400 (about +5 %): 121 765 as fair and 161 265 with the mandatory 39 500, and every rent after it moves with the band and factor; the change is the list `firstLeaseListPriceCents` reads, and `assess.test.ts` pins the v1 numbers. If the mentors give a first-lease date, the age comes from it instead of the model year, through the same `curveAgeInMonths` switch as D31.

## Not a question any more: card 8's curve age (D31)

Decided by Johannes on 2026-11-06 as an assumption and stated in the README "Status" section: the pack has no first-lease date, so a first life is aged from its lease start and an item with previous lives from 1 January of its model year (D11). It is not asked as a question, but it may not hold for a real item, so the other reading stays pinned in the tests and the switch is one line.

**The reading.** The pack has no first-lease date. Every pack item is new on the shelf, so a first life is counted from its lease start; an item with previous lives keeps D11 (whole months from 1 January of the model year). It gives the brief's number.

**What the code does today.** Card 8's `ebike-003`, valued on 2027-06-05, is 7 months into its lease: 80 % on the curve, **311 200** as new (the brief's number), 259 230 as good with 1 800 km. The return costs 330 675 − 311 200 + 4 500 = **23 975** as new, 75 945 as good. `curveAgeInMonths` in `src/domain/residual/age.ts` picks the rule.

**If the answer differs.** With D11 for every item the bike is 17 months old (model year 2026): 62.5 %, 243 125 as new and **202 523** as good with 1 800 km; the return is 92 050 as new and 132 652 as good. The change is one line in `curveAgeInMonths` (return `ageInMonths` for every item); `market-value.test.ts` already pins both numbers, and the card 8 rows in the README "Status" table and in [exits.md](features/exits.md) change with it.
