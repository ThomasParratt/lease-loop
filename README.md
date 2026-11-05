# Lease Loop · Northfina × Hive Helsinki hackathon

Starter repo for the **Lease Loop** challenge, 5–6 November 2026 at Hive Helsinki. Teams of 3 build a circular-economy leasing app: one e-bike, laptop or tractor, three lives.

- 📋 **The challenge:** [CHALLENGE.md](CHALLENGE.md)
- 📐 **Engineering rules (35 % of your score):** [RULES.md](RULES.md)
- 🗂️ **The data pack:** [data/DATA.md](data/DATA.md)

**Northfina** is a Helsinki-based leasing platform. It started as Etufillari, a bike-leasing service, and now leases any kind of asset. Dealers, banks and customers use it to get from a price quote to a signed contract, then through monthly invoices to the end of the lease. This repo is a small, independent playground, not our product code.

---

## Quick start

You need **Git** and **Node.js 22** (with [nvm](https://github.com/nvm-sh/nvm): `nvm install` reads `.nvmrc`).

```bash
git clone https://github.com/<your-team>/northfina-lease-loop.git
cd northfina-lease-loop
nvm install          # Node 22
npm ci               # installs dependencies and the Git hooks
npm run db:setup     # creates .env and a local SQLite database with the 30 assets
npm run dev          # http://localhost:3000
```

You should see the asset catalogue in English. Switch to Finnish, Swedish or Estonian in the header.

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run setup`         | Set up a checkout or worktree: dependencies, database, hooks   |
| `npm run dev`           | Start the app with hot reload                                  |
| `npm test`              | Run all tests once (`npm run test:watch` to keep them running) |
| `npm run test:coverage` | Tests with the 60 % coverage gate                              |
| `npm run check:all`     | **Everything CI runs.** Run it before you push                 |
| `npm run db:migrate`    | After you change `prisma/schema.prisma`: creates a migration   |
| `npm run db:reset`      | Wipe the local database and seed it again                      |
| `npm run db:studio`     | Browse the database in your browser                            |

---

## 15-minute tour

New to TypeScript, Next.js or Prisma? Read these files in this order:

1. **`data/`**: the synthetic data pack. Open `assets.json` and `coefficient-table.json`, then the worked example in [DATA.md](data/DATA.md).
2. **`src/data/`**: Zod schemas that load and type-check every data file. If you want to know a field's type, look here.
3. **`src/domain/coefficient.ts`** and its test: a pure function that finds the pricing factor, and how we test it. **Your business logic goes in `src/domain/`**, written the same way.
4. **`src/domain/price-list.ts`**: picks the right price for a date. The price list changes on Friday.
5. **`src/app/[locale]/page.tsx`**: the catalogue page. Next.js App Router: every folder under `src/app/` is a URL.
6. **`src/app/api/assets/`**: API routes. They use the response envelope (`src/server/api-response.ts`), and the status change writes an audit row in the same transaction (`src/server/audit.ts`).
7. **`prisma/schema.prisma`**: the database. Add your own models (Contract, Invoice, …) and run `npm run db:migrate`.

Handy docs: [Next.js App Router](https://nextjs.org/docs/app), [TypeScript for programmers who know C](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html), [Prisma](https://www.prisma.io/docs), [Vitest](https://vitest.dev/guide/), [Tailwind CSS](https://tailwindcss.com/docs).

Everything in the skeleton is replaceable. Keep the rules, not necessarily the code.

---

## Status

Kept by each wave's hardening agent (AGENTS.md rule 9); the draft of the submission PR's "Scenario cards that work" and "Smart Problems" sections.

| Card               | What the judges compare                                                                             | Works   | Proved by |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------- | --------- |
| 1 Happy path       | Aino, `ebike-003`, 36 months, no down payment: net and gross rent, first 3 invoices, total cost     | not yet | —         |
| 2 The price lock   | `laptop-004` quoted on v1 (5 Nov), signed on v2 (6 Nov, 8 % cheaper): which price is locked and why | not yet | —         |
| 3 Tax is not price | `ebike-001`, 24 months from 15 Sep 2026: the December 2026 and January 2027 invoices                | not yet | —         |
| 4 Calendar traps   | `laptop-001`, 36 months from 31 Jan 2026: due dates of the February 2026 and February 2028 invoices | not yet | —         |
| 5 Too young        | Mikko (17) applies for `laptop-008`: a kind, clear no                                               | not yet | —         |
| 6 Who can sign?    | Norvi Logistics, 4 × `ebike-004`: the applicant may not sign for the company                        | not yet | —         |
| 7 Big ticket       | Haapalan Tila, `farm-002`, 48 months, €20,000 down: which questions appear, why manual review       | not yet | —         |
| 8 Early exit       | Card 1 ended in month 7: what it costs and why                                                      | not yet | —         |
| 9 Second life      | `ebike-007` back in fair condition at 18,400 km: refurbish, `wait-02` or `wait-13`, at what rent    | not yet | —         |
| 10 Third life      | `ebike-008` after 2 lives: lease again, show the passport and the CO₂ saved                         | not yet | —         |

**Smart problems** (order from `docs/kickoff-brief.md` section 4):

- 7 Circular impact: not yet.
- 1 Lock the price, not the tax: not yet.
- 5 Money that adds up: not yet (integer cents and `formatEuro` exist in `src/domain/money.ts`).
- 6 Explain my price: not yet.
- 2 Fair early exit and 3 Second-life matchmaking: not yet, if the spine stands by Friday morning.

## Features

One page per feature slice under `docs/features/` (template: [docs/features/README.md](docs/features/README.md)):

- [Catalogue, demo clock, actor and audit trail](docs/features/catalogue.md) (wave 0)
- [Circular impact and the passport](docs/features/circular-impact.md) (wave 1)

## Team notes

- `AGENTS.md`: the organiser's rules plus our working rules; every agent and person reads it first.
- `docs/kickoff-brief.md`: the plan (scope, decisions, schema ownership, events, waves, the agent brief template).
- `docs/decisions.md`: every decision with its reason; `docs/stack-notes.md`: the traps of this stack; `docs/log/`: one time log per task; `docs/reviews/`: the wave reviews.
- `tests/meta-rules.test.ts`: the engineering rules checked against the repository itself, in `npm test`.
- The practice repo (`ThomasParratt/leasing-platform`) is a read-only parts bin cloned beside this one; port functions with their tests, never structure.
- A branch is named after the feature it builds, `<type>/<slice>` with the conventional-commit type as prefix: `feat/pricing`, `feat/invoices`, `chore/wave0-upkeep`, `test/wave1-hardening`; a session that starts on a generated name renames it with `git branch -m` before its first push.
- Nobody pushes to `main` directly, not even docs or tooling: every change is a branch and a pull request on the fork, CI runs on the PR, and it is squash-merged with a conventional subject.

### Database

SQLite through Prisma 7, schema in `prisma/schema.prisma`, `snake_case` columns. Models: `Asset` and `Customer` (both seeded from the data pack by `npm run db:setup`, idempotently), `Quote`, `Application`, `Contract`, `Invoice`, `AssetEvent` (the passport; its autoincrement id is the order), `ReturnAssessment` and `AuditLog`. Who owns and writes each model is `docs/kickoff-brief.md` section 6. Money is integer cents, rent factors integer millionths, VAT rates basis points, business dates ISO day strings. SQLite has no enums: the asset values are Zod enums in `src/data/schemas.ts`, and the allowed decisions, contract and invoice statuses, invoice kinds and event kinds in `src/domain/statuses.ts`. The server function that writes a value parses it with its schema itself, before the write (D23), so a caller that skips the route cannot store a bad one. An asset is `available`, `reserved` (held, the data pack's meaning), `leased` (on a contract), `returned` or `sold` (bought out) (D22). Customers are read through `listCustomers` / `getCustomer` in `src/server/customers.ts`, in the `Customer` shape of `src/data/schemas.ts`.

### Who is acting

There is no login (D17). The "continue as" picker (`src/components/actor-picker.tsx`, in the header) posts `{ actor }` (a customer id or `admin`) to `POST /api/actor`, which sets the `lease-loop-actor` cookie; `DELETE /api/actor` clears it. Pages and routes call `readActor(db)` from `src/server/actor.ts` once per request and pass the actor to `withAudit`; an unknown or missing cookie reads as `anonymous`.

### API

Every API route has one row in the route table, `src/server/routes.ts`: method, the Next.js path pattern (`/api/assets/[id]/status`), a summary, a tag, and the Zod schemas of its params, query, body and success `data`. Route files import their schemas from there. `npm run openapi` turns the table into [docs/openapi.json](docs/openapi.json) (OpenAPI 3.1, success bodies wrapped in the `ok()` envelope, errors in the `fail()` one). Tests fail when a `route.ts` has no row (or a row no file) and when the committed `docs/openapi.json` differs from the table, so add the row first and run `npm run openapi` after.

### Events

When one change touches several slices' rows at one instant, the owner emits one event inside `withAudit` and the other slices react in the same transaction (`docs/kickoff-brief.md` section 7). The payloads are Zod schemas in `src/domain/events.ts`: `CONTRACT_SIGNED`, `CONTRACT_BOUGHT_OUT`, `UNIT_RETURNED`, `UNIT_PASSED_ON`, `INVOICE_PAID`. `src/server/events.ts` has `onEvent(type, handler)` and `emit(tx, event)`: handlers get the same `tx`, run in registration order, and a handler that throws rolls the whole change back.

### Pages

`/[locale]` is the catalogue, `/[locale]/demo` the demo page (the clock and, from wave 1, one button per scenario card), `/[locale]/audit` the newest 50 audit rows. The header nav links all three, beside the "continue as" actor picker and the language switcher; it wraps on a phone. The layout reads the customers and the current actor once per request for the picker. Pages are built from the kit in `src/components/ui` (`PageHeader`, `Card`, `Button`, `LinkButton`, `Badge`, `DefinitionList`, `Field`, `Notice`, `Money`, `DateText`, `NavLinks`, one `index.ts`) and the team's design tokens in `src/app/globals.css` (D21): pages use the roles `brand`, `focus`, `success`, `warning`, `danger`, `info`, `neutral`, `surface`, `raised`, `muted`, `line`, `line-strong`, `ink`, `ink-muted` (e.g. `bg-brand`, `text-ink-muted`, `bg-success-soft`), never raw colour classes or the scales under them. Each token switches with the colour scheme, so no page needs a `dark:` class.

### Application

The question flow (CHALLENGE.md smart problem 4) is pure code in `src/domain/question-flow/`:

- `engine.ts`: `visibleQuestions(bank, context, answers)` applies `ask_when` as `data/DATA.md` says (all conditions; empty = always; `in`, `gte`, `lte`; `answers.<id>`), in the bank's order. `customer_type` is the applicant's own `q_customer_type` answer once given, the context's before. `nextQuestion` is the first visible question without an answer; `pruneAnswers` drops answers to questions that are no longer visible, repeating until stable (can-sign no → signatory named → yes: the signatory goes). `whyWeAsk(question, locale)` falls back to English. The context is `{ customerType, category, financedCents, termMonths }`, built by the caller from the quote.
- `eligibility.ts`: `evaluate(rules, input)` → `{ decision, reasons: { code, params }[] }` (D9). Any failed rule rejects and every failure is listed (`too_young` with `eighteenOn`, `residency_not_allowed`, `unaffordable` at 30 % of net income against the gross rent, `invalid_business_id`, `financed_out_of_range`, `missing_answer`); else a PEP goes to `manual_review`; else a company applicant who cannot sign is `awaiting_signatory`; else `approved` with `all_checks_passed`. Affordability applies only when the bank asked for income (consumers from 200 000 financed). A 29 February birthday turns 18 on 1 March.
- `business-id.ts`: the Y-tunnus check digit (weights 7 9 10 5 8 4 2, mod 11; remainder 1 is never valid). `answers.ts`: the answers → eligibility input, answer validation by type, euros typed by a person → cents without floats, gross = net + VAT rounded half up once (a local copy until pricing's VAT helper lands), and `answersFromCustomer` for the demo prefill.

`src/server/applications.ts` has `createApplication` (reads the quote and customer, prunes, refuses incomplete or malformed answers and an expired quote, evaluates, writes the row through `withAudit`), `decideApplication` (D10: an admin decides a manual review, and one that also needs a signatory then waits for them; the named signatory signs or declines; anything else is final) and `getApplication`. Routes: `POST /api/applications`, `GET /api/applications/[id]`, `POST /api/applications/[id]/decision`. Pages: `/[locale]/apply/[quoteId]` asks one question at a time for the acting customer, with "why we ask", back, progress, a review with "change" per answer and a notice when a change removes answers; `/[locale]/applications/[id]` writes the decision and each reason from `decision.reason.<code>` in the visitor's language, with the admin's review buttons or the signatory's sign form.

### Passport and impact

Every lease, return, buyout and pass-on writes a row to the asset event log (`AssetEvent`, ordered by id) through the handlers in `src/server/passport-handlers.ts`, registered by `src/server/event-handlers.ts` (a service that emits imports that module). `src/domain/passport.ts` folds the log into lives (`livesFromEvents`, `passportFor`; the lives `previous_lives` counts come first, undated, 24 months assumed). `src/domain/second-life/co2.ts` is the CO2 method of D15: a later life avoids footprint × (1 − refurbishment share) × its months ÷ the design life, capped at the design life that is left; the first life earns nothing; grams rounded once to whole kg. `GET /api/assets/[id]/passport` returns the asset, its lives and the CO2; the page is `/[locale]/assets/[id]/passport`, and the catalogue shows the fleet total in the impact strip. Card 10: `ebike-008` has saved 29 kg from its second life and reaches 58 kg after a 24-month third life. The method, worked example and open questions: [docs/features/circular-impact.md](docs/features/circular-impact.md).

### Demo clock

The demo page moves the app to any day, so a scenario card dated September 2026 or February 2028 runs on its own date. `POST /api/demo/clock` with `{ "asOf": "2026-09-15" }` sets the `lease-loop-as-of` cookie and `{ "asOf": null }` clears it. Pages and routes call `todayForRequest()` from `src/server/demo-clock.ts` once and pass the day down; it is `todayIso()` unless the cookie holds a real calendar day (an invalid one is ignored). The catalogue's "prices on" follows it. It is the only date the server takes from the browser.

---

## Submitting

You can't push to this repo. You work in **your own fork** and send us a **pull request**.

1. **One person per team forks** this repo (the **Fork** button, top right) and adds the other two as collaborators in the fork (_Settings → Collaborators_).
2. **Enable Actions in the fork**: open the fork's **Actions** tab and click _"I understand my workflows, go ahead and enable them"_. Now CI runs on every push.
3. Everyone clones the fork and commits as usual. Small, conventional commits; the hooks help.
4. **Before Friday 6 November 16:00**, open a pull request from your fork to `etufillari/northfina-lease-loop` `main`.
   - Title: `Team <name>: <your product name>`.
   - Fill in the template: members, the Smart Problems you picked, and how to demo.
   - You can open it early and keep pushing until the deadline.
5. **At 16:00 we record the latest commit of every open pull request.** That commit is what we judge. Anything pushed later is ignored, and pull requests opened after 16:00 don't count.

We won't merge pull requests. They're only how you hand in your work.

**Heads-up:** forks of a public repo are public, so other teams can see your fork. Your commit history shows who built what, and copying another team's work disqualifies both copies.

---

## Your code is yours

The starter code in this repo is MIT-licensed (see [LICENSE](LICENSE)); use it however you like.

**Your team owns the code you write.** Opening a pull request gives Northfina permission to read and run your code for judging and for interviews with your team. Nothing more: we won't merge it, reuse it or publish it elsewhere without asking you first.

## Help

- During the hackathon: **#ask-a-mentor** on the hackathon Discord.
- A bug in this starter repo: open a GitHub issue here.
- Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
