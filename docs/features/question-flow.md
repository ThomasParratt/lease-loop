# The question flow and the application

## What it does

The applicant answers only the questions of `data/questions.json` that apply to their deal, one at a time, with "why we ask" for each; going back and changing an answer removes the answers that no longer apply and says so. On submit, the eligibility rules give a clear yes, no, "a person will check" or "waiting for the signatory", each with reasons as codes the page writes in the visitor's language (CHALLENGE.md smart problem 4, spine 3).

## The rule

### Which questions appear (`ask_when`)

A question is asked when **all** its `ask_when` conditions hold; an empty list means always (`data/DATA.md`). Fields: `customer_type`, `category`, `financed_amount_cents`, `term_months`, `answers.<id>`; ops `in`, `gte`, `lte` (both limits included). The order is the bank's. A condition on an unanswered question never holds, so a follow-up appears only after its trigger is answered. `customer_type` reads the applicant's own `q_customer_type` answer once given, the deal's before.

**Card 7**, Haapalan Tila Oy, `farm-002`, 48 months, 2 000 000 down: financed **12 500 000**, a company, a farm machine.

| Question              | Why it appears at 12 500 000                     |
| --------------------- | ------------------------------------------------ |
| `q_customer_type`     | always                                           |
| `q_email`             | always                                           |
| `q_business_id`       | sole trader or company                           |
| `q_company_name`      | company                                          |
| `q_can_sign`          | company                                          |
| `q_vat_registered`    | sole trader or company                           |
| `q_farm_registry`     | category `farm_machine`                          |
| `q_annual_revenue`    | company and financed ≥ 5 000 000                 |
| `q_beneficial_owners` | company and financed ≥ 5 000 000                 |
| `q_pep`               | financed ≥ 1 000 000                             |
| `q_pep_details`       | financed ≥ 1 000 000 **and** `q_pep` = yes, only |

Not asked: the consumer questions (name, birth date, country, employment, income), `q_signatory_email` (can-sign is yes) and `q_usage_purpose` (not an e-bike).

**Card 6**, Norvi Logistics Oy, four `ebike-004`: financed **2 196 000**. PEP is asked (≥ 1 000 000), revenue and owners are not (< 5 000 000), the usage purpose is (an e-bike), and `q_can_sign` is.

**Card 1**, Aino, `ebike-003`, **389 000**: only the consumer questions, the income question (consumer and ≥ 200 000) and the usage purpose; no PEP.

### Changing an answer (pruning)

After every answer, `pruneAnswers` drops the answers to questions that are no longer visible and repeats until nothing changes (a dropped answer can hide another question). Card 6's trap: the coordinator answers can-sign **no**, names `signatory@norvi.example.com`, goes back and changes to **yes**: the signatory answer goes, and the page says which answer was removed. Changing the customer type from company to consumer drops every company answer in one go. The server prunes again on submit, so a stale answer from the browser never reaches the rules.

### Eligibility (D9)

| Rule (id in `questions.json`) | Check                                                                          | Reason code                                 |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| `min_age`                     | consumers and sole traders are 18 on the start date                            | `too_young` { birthDate, eighteenOn }       |
| `residency`                   | country FI, SE or EE (when asked)                                              | `residency_not_allowed` { country }         |
| `affordability`               | consumers: gross rent × 100 ≤ net income × 30 (when the income was asked)      | `unaffordable` { gross, max, income cents } |
| `business_id`                 | sole traders and companies: the Y-tunnus check digit                           | `invalid_business_id` { businessId }        |
| `financed_limits`             | financed within the coefficient table, 30 000 to 25 000 000                    | `financed_out_of_range` { … }               |
| `pep_manual_review`           | a PEP (answered yes, or known from the customer record) is never auto-approved | `pep` → `manual_review`                     |
| (D10)                         | a company applicant who cannot sign                                            | `signatory_needed` → `awaiting_signatory`   |

Order: any failed rule → `rejected`, with **every** failure listed; else PEP → `manual_review`; else cannot sign → `awaiting_signatory`; else `approved` with `all_checks_passed`.

**Card 5**, Mikko (`cust-mikko`), born **2009-03-10**, start **2026-11-05**: he turns 18 on **2027-03-10**, so he is 17 on the start date: `rejected` with `too_young { birthDate: 2009-03-10, eighteenOn: 2027-03-10 }`, and the page says "You can apply from 10 March 2027". His gaming laptop `laptop-008` (289 000, band B) at 25.5 % VAT, half up:

| Term | Net rent | Gross rent | 30 % of 40 000 | Affordable |
| ---- | -------- | ---------- | -------------- | ---------- |
| 24   | 10 269   | 12 888     | 12 000         | no         |
| 36   | 7 972    | 10 005     | 12 000         | yes        |
| 48   | 6 631    | 8 322      | 12 000         | yes        |

At 36 and 48 months the age is the only reason; at 24 both reasons are listed. On 2027-03-10 the age rule passes, on 2027-03-09 it does not. Someone born on 29 February turns 18 on 1 March in a year without one.

**Card 6**: Norvi answers can-sign **no**: `awaiting_signatory` with `signatory_needed { signatoryEmail }`. The named signatory signs (approved) or declines (rejected) on the decision page.

**Card 7**: Haapala's owner is a PEP: `manual_review` with `pep`, never approved by a rule. An admin decides on the decision page; the decision and the reviewer are kept as a `reviewed` reason. A PEP case that also needs a signatory goes to `awaiting_signatory` once the admin approves.

**Two decisions at once.** The decision is a conditional write: `updateMany where { id, decision: <the state read> }`, and exactly one row must change. If two admins (or a double-click) decide the same case at the same instant, the first wins; the second answers 409 `APPLICATION_NOT_PENDING`, and its transaction rolls back with no second audit row and no second `reviewed` reason.

### The Y-tunnus check digit

Seven digits, a hyphen, a check digit. Multiply the digits by **7 9 10 5 8 4 2**, sum, take the remainder mod 11: remainder 0 → check digit 0; remainder 1 → no valid id; otherwise 11 − remainder.

Typo Trading Oy (`cust-broken-id`) has **1234567-8**: 1·7 + 2·9 + 3·10 + 4·5 + 5·8 + 6·4 + 7·2 = 153; 153 mod 11 = 10; check digit 11 − 10 = **1**, not 8. Rejected with `invalid_business_id { businessId: 1234567-8 }`. Every other business id in `customers.json` is valid. A wrong check digit is a valid _answer_ (the form takes it) and a _reason_ (the rules reject it), so the applicant sees why.

## Decisions

- **D9** eligibility: the rules above, every check a code with params.
- **D10** manual review and the signatory: the four statuses; the admin decides a manual review, the named signatory signs.
- Inside the slice (see `docs/log/wave1-questions.md`): `customer_type` follows the applicant's answer; a PEP known from the record counts below 10 000 EUR; affordability only where the bank asks for income; a failed rule always rejects.

## Pure functions

```ts
// engine.ts
type FlowContext = { customerType: string; category: string; financedCents: number; termMonths: number };
type Answer = string | readonly string[]; // money: integer cents as digits
type Answers = Readonly<Record<string, Answer>>;
visibleQuestions(bank: readonly Question[], context: FlowContext, answers: Answers): Question[];
nextQuestion(bank, context, answers): Question | null;
isComplete(bank, context, answers): boolean;
pruneAnswers(bank, context, answers): Record<string, Answer>;
whyWeAsk(question: Question, locale: 'en' | 'fi' | 'sv' | 'et'): string;

// eligibility.ts
evaluate(rules: readonly EligibilityRule[], input: EligibilityInput):
  { decision: 'approved' | 'rejected' | 'manual_review' | 'awaiting_signatory'; reasons: { code; params }[] };
birthdayAtAge(birthDate: string, years: number): string;
maxAffordableRentCents(monthlyNetIncomeCents: number): number;

// business-id.ts
isValidBusinessId(value: string): boolean;
businessIdCheckDigit(sevenDigits: string): number | null;

// answers.ts
eligibilityInputFromAnswers({ context, answers, startDate, grossMonthlyRentCents, financedLimits?, knownPep? }): EligibilityInput;
validateAnswer(question: Question, answer: Answer): boolean;
parseEurosToCents(input: string): number | null;
grossFromNetCents(netCents: number, vatRateBp: number): number;
answersFromCustomer(customer: Customer): Record<string, Answer>;

// src/server/applications.ts
createApplication(db, { quoteId, customerId, answers, today, actor }); // → { ok, application } | { ok: false, reason }
decideApplication(db, { id, decision, reviewedBy, today, actor });
getApplication(db, id): Promise<ApplicationView | null>;
```

## Files

- `src/domain/question-flow/engine.ts`, `eligibility.ts`, `business-id.ts`, `answers.ts` and their tests
- `src/server/applications.ts` (+ test); routes `src/app/api/applications/route.ts`, `[id]/route.ts`, `[id]/decision/route.ts`; rows in `src/server/routes.ts`
- `src/app/[locale]/apply/[quoteId]/page.tsx`, `src/components/question-flow.tsx`; `src/app/[locale]/applications/[id]/page.tsx`, `decision-form.tsx`
- Message keys `apply.*`, `question.*`, `decision.*` in the four files

## Tests that pin the numbers

| Number                                                                          | Test                                                                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Card 7's ten questions, PEP details after yes                                   | `engine.test.ts` "card 7: …"                                                                                                        |
| Card 6 at 2 196 000, signatory pruning                                          | `engine.test.ts` "card 6: …", "pruneAnswers … card 6"                                                                               |
| Card 1's consumer questions                                                     | `engine.test.ts` "card 1: …"                                                                                                        |
| Mikko 2027-03-10; rents 12 888 / 10 005 / 8 322                                 | `eligibility.test.ts` "evaluate: card 5"                                                                                            |
| Norvi `awaiting_signatory`, Haapala `manual_review`                             | `eligibility.test.ts` "card 6", "card 7"; `applications.test.ts` on a real DB                                                       |
| 1234567-8 → check digit 1; every other id valid                                 | `business-id.test.ts`                                                                                                               |
| 10 730 net → 13 466 gross                                                       | `answers.test.ts` "grossFromNetCents"                                                                                               |
| Every persona decides without throwing                                          | `eligibility.test.ts` "every customer in customers.json …"                                                                          |
| Admin review, signatory sign-off, final states                                  | `applications.test.ts` "decideApplication (D10)"                                                                                    |
| Two decisions at the same instant: one wins, the other writes nothing           | `applications.test.ts` "two decisions at the same instant …"                                                                        |
| Cards 5, 6, 7 and every customer × category on the data pack (scenario harness) | `src/domain/scenarios/card-05-too-young.test.ts`, `card-06-who-can-sign.test.ts`, `card-07-big-ticket.test.ts`, `customers.test.ts` |

## Open questions

- The signatory signs by typing their name or e-mail (no login, D17); the actor is audited. A real flow would send them a link.
- Should a PEP below 10 000 EUR (not asked by the bank, known from the record) go to manual review? We say yes; the bank's targeting suggests the question only matters from 10 000 EUR.
- Affordability uses the chosen term's gross rent; the page could suggest the shortest term that passes (Mikko's 36 months).
- A double-submit of the application form creates two applications for one quote (`quote_id` is not unique on purpose: a rejected customer may reapply). Only one can be signed; the form should disable its button while sending.
- `grossFromNetCents` is a local copy until the money/VAT helper on main replaces it.
