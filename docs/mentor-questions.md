# Questions for the mentors

Three readings of the brief we took in code and want confirmed on Friday morning. For each: what we read, what the code does today, and what changes if the answer is different. The decisions are in [decisions.md](decisions.md).

Not a question here: Thomas's question-flow validation (#25, merged) added four rules (D37 to D40: the birth-date range, answers checked against the customer record, only the named signatory signs, only the acting customer applies). They are listed for information; the scenario suite on `main` passes with them.

## 1. Fleet quantity: is card 6 "4 × `ebike-004`" four units on one asset row? (D8, issue #13)

**Our reading.** A quote, an application and a contract carry a quantity (default 1). The financed amount is the list price × the quantity − the down payment, and the band and the question thresholds are read on that total: four bikes are band C, one bike is band B, and the total crosses the PEP threshold.

**What the code does today.** `priceQuote` multiplies by the quantity (`src/domain/pricing/`); the application and the contract copy it unchanged ([pricing.md](features/pricing.md), [contracts.md](features/contracts.md)). The data pack has one `ebike-004` row, so signing takes that one row out of the catalogue (`leased`) and the other three are "to be delivered". One contract, one invoice per month.

**If the answer differs.** If the mentors mean four separate items, signing must lock N available rows of the same model (Thomas's grouping of identical units in the schema, issue #13, additive) and refuse when fewer are free; D28 (one next lease per lease) waits on this answer, since a fleet passed on to two people would have two successors. If they mean one item only, the quantity input goes and card 6 is priced for one bike.

## 2. Pass on: is the next user a named person? (D16)

**Our reading.** "Pass it on" names the next person (a friend, a colleague), who then applies in the normal way with a fresh quote at the second-life price. "Give it back" is the other exit, where matchmaking on the waiting list (D13, wave 3) finds the next customer.

**What the code does today.** The exit form asks for a customer for `pass_on` and refuses without one (`pass_on_needs_next_customer`), with yourself (`next_customer_is_self`) or with an unknown id (`next_customer_not_found`). The asset becomes `returned` and its passport records `passed_on` with the next customer ([exits.md](features/exits.md)).

**If the answer differs.** If passing on means "back to the waiting list", `pass_on` and `return` become one flow: the person picker and its three refusals go, and the next customer comes from D13's matchmaking. The billing (D14) and the passport entry stay as they are.

## 3. Card 8: how old is a first-life item on the residual curve? (D31, provisional; D11)

**Our reading.** The pack has no first-lease date. Every pack item is new on the shelf, so a first life is counted from its lease start; an item with previous lives keeps D11 (whole months from 1 January of the model year). Johannes chose this provisionally because it gives the brief's number.

**What the code does today.** Card 8's `ebike-003`, valued on 2027-06-05, is 7 months into its lease: 80 % on the curve, **311 200** as new (the brief's number), 259 230 as good with 1 800 km. The return costs 330 675 − 311 200 + 4 500 = **23 975** as new, 75 945 as good. `curveAgeInMonths` in `src/domain/residual/age.ts` picks the rule.

**If the answer differs.** With D11 for every item the bike is 17 months old (model year 2026): 62.5 %, 243 125 as new and **202 523** as good with 1 800 km; the return is 92 050 as new and 132 652 as good. The change is one line in `curveAgeInMonths` (return `ageInMonths` for every item); `market-value.test.ts` already pins both numbers, and the card 8 rows in the README "Status" table and in [exits.md](features/exits.md) change with it.
