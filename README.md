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

Kept by each wave's hardening agent (AGENTS.md rule 9); the draft of the submission PR's "Scenario cards that work" and "Smart Problems" sections. Every card runs twice: as a table-driven test on the real data pack in [`src/domain/scenarios/`](src/domain/scenarios/) (pure, `npx vitest run src/domain/scenarios`), and end to end in [`src/server/scenarios/`](src/server/scenarios/) on a real migrated database through the services the routes call: quote, the question flow, the decision, signing, payments, the exit, the passport and the audit chain (`npx vitest run src/server/scenarios`). A todo names a pinned number still to build. How the tests stay independent: [docs/features/test-isolation.md](docs/features/test-isolation.md).

| Card               | What the judges compare                                                                                                                                                                                      | Works                                                                                                                                                                                                                                                                         | Proved by                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Happy path       | Aino, `ebike-003`, 36 months, no down payment: band B, factor 0.027584, net 10 730, VAT 2 736, gross 13 466; the first 3 invoices; January 2027 at 26 % is 13 520; buyout 58 350; the invoices total 486 612 | yes, end to end                                                                                                                                                                                                                                                               | `card-01-happy-path.test.ts` "prices band B …", "bills the first three invoices …", "the invoices add up exactly …"; `src/server/scenarios/card-01-08.test.ts` "quote → approved → signed …"              |
| 2 The price lock   | `laptop-004` on v1 (5 Nov, 349 000, rent 9 627) and v2 (6 Nov, 321 100, rent 8 857): which price is locked and why                                                                                           | yes, end to end                                                                                                                                                                                                                                                               | `card-02-price-lock.test.ts` "on 6 Nov the quote is valid, locked to v1 …"; `card-02-07.test.ts` "quoted on v1 on 5 Nov, signed on 6 Nov under v2 …" (`price_locked_from_quote` with both versions)       |
| 3 Tax is not price | `ebike-001`, 24 months from 15 Sep 2026: net 6 957; December gross 8 731, January gross 8 766                                                                                                                | yes, end to end                                                                                                                                                                                                                                                               | `card-03-tax-is-not-price.test.ts` "the invoice of …"; `card-02-07.test.ts` "ebike-001, 24 months from 15 Sep 2026 (demo day) …"                                                                          |
| 4 Calendar traps   | `laptop-001`, 36 months from 31 Jan 2026: net 3 432; due 28 Feb 2026 and 29 Feb 2028                                                                                                                         | yes, end to end                                                                                                                                                                                                                                                               | `card-04-calendar-traps.test.ts` "invoice … is due on …"; `card-02-07.test.ts` "laptop-001, 36 months from 31 Jan 2026 …" (ends 30 Jan 2029)                                                              |
| 5 Too young        | Mikko (17) applies for `laptop-008`: too young until 10 Mar 2027; affordability would pass at 36 and 48 months                                                                                               | yes, end to end                                                                                                                                                                                                                                                               | `card-05-too-young.test.ts` "is rejected on 5 Nov 2026 with too_young …"; `card-02-07.test.ts` "card 5 …" (signing refused: `application_not_approved`); `/[locale]/applications/[id]` writes the date    |
| 6 Who can sign?    | Norvi, 4 × `ebike-004`: 2 196 000 financed, band C, rent 58 993 (one alone: band B, 15 144); `awaiting_signatory`                                                                                            | yes, end to end                                                                                                                                                                                                                                                               | `card-06-who-can-sign.test.ts`; `applications.test.ts` "card 6"; `card-02-07.test.ts` "card 6 …" (the applicant's signing refused)                                                                        |
| 7 Big ticket       | Haapala, `farm-002`, 48 months, 2 000 000 down: band D, 272 037.5 → 272 038; buyout 1 000 000; the company, farm, revenue, owners and PEP questions; manual review                                           | yes, end to end                                                                                                                                                                                                                                                               | `card-07-big-ticket.test.ts`; `applications.test.ts` "card 7"; `card-02-07.test.ts` "card 7 …" (signing refused until the admin decides)                                                                  |
| 8 Early exit       | Card 1 ended in month 7: remaining rents 311 170, market value 311 200, buyout 58 350, the D14 balance line by line                                                                                          | yes: market value by months since lease start (D31, an assumption: a pack item is new at its first lease); buy 330 675, return 75 945 (good, 1 800 km)                                                                                                                        | `card-08-early-exit.test.ts` (no todos left); `src/server/scenarios/card-01-08.test.ts` "seven rents paid, preview … then a buy" (29 rents cancelled, 330 675 + 26 % VAT, asset sold, audit chain intact) |
| 9 Second life      | `ebike-007` back fair at 18 400 km: refurbish? who gets it, `wait-02` or `wait-13`? at what rent?                                                                                                            | yes: no refurbishment beyond the mandatory battery 35 000 + inspection 4 500; `wait-02` wins (fair is enough for it, `wait-13` needs 12 000 more to reach good); relisted at 155 476, 8 710 net a month for 12 months; the assessment page `/en/assets/ebike-007/second-life` | `card-09-second-life.test.ts` (no todos); `src/server/scenarios/card-09.test.ts`; `src/domain/second-life/match.test.ts`                                                                                  |
| 10 Third life      | `ebike-008` after 2 lives, good, 9 800 km: lease it again, show the passport and the CO₂                                                                                                                     | yes: assessed (37 101, inspection only), relisted good, leased 24 months at 1 359 net; the passport shows three lives and 58 kg (0 + 29 + 29)                                                                                                                                 | `src/server/scenarios/card-10.test.ts` "ebike-008 is leased a third time …" (no todos); `card-10-third-life.test.ts`; `co2.test.ts`                                                                       |

The pure card files are in `src/domain/scenarios/`, the end-to-end ones in `src/server/scenarios/`; the others sit next to the code they test.

**Assumption (D31):** the pack has no first-lease date, so an item on its first life is aged on the residual curve from the day its lease started, as if every pack item were new on the shelf; an item with earlier lives is aged from 1 January of its model year (D11). This is how we treat it even where it may not hold for the real item; card 8's market value of 311 200 rests on it, and the other reading (202 523 as good) is pinned beside it in `src/domain/residual/market-value.test.ts`.

**Traps** (`src/domain/scenarios/traps.test.ts`): the inclusive band edge (`laptop-002` at 199 999 is A, `laptop-003` at 200 000 is B; on v1 only, v2 prices both at 184 000); `ebike-010` below the table on v1 (inside band A on v2) and `farm-006` above it, each a code; the broken business ID; both twin pairs told apart in the data (the matcher's tie-break is a wave 3 todo); invoices on 31 Dec 2026 at 25.5 % and on 1 Jan 2027 at 26 %; 29 Feb 2028 due dates; the price list in force on 5 and 6 Nov. The reserved `ebike-009` is refused where its status is read: `src/server/quotes.test.ts` "refuses a reserved asset (ebike-009) with its status". Every customer × one asset per category decides with a known code: `src/domain/scenarios/customers.test.ts`.

**Finding, fixed:** the quote’s totals used to add the down payment and the buyout net while invoice 0 charges VAT on the down payment (card 7: 510 000 short). The pricing slice fixed it on `main` (`4ec3b2e`); `src/domain/scenarios/quote-schedule.property.test.ts` now proves that the quote total equals what the invoices add up to whenever one VAT rate covers the term, and "card 7: invoice 0 is the quote down payment with its VAT".

**Smart problems** (order from `docs/kickoff-brief.md` section 4):

- 4 The smart question flow: done ([docs/features/question-flow.md](docs/features/question-flow.md)).
- 7 Circular impact: done for the method, the passport, the fleet counter and the passport after a return; the third-life lease is wave 3 ([docs/features/circular-impact.md](docs/features/circular-impact.md)).
- 1 Lock the price, not the tax: done; the quote freezes the list version and the net rent, and each invoice takes the VAT of its own date ([docs/features/pricing.md](docs/features/pricing.md), [docs/features/invoicing.md](docs/features/invoicing.md)).
- 5 Money that adds up: done for the schedule and the balance (property tests in `src/domain/invoicing/schedule.property.test.ts` and `src/domain/scenarios/quote-schedule.property.test.ts`) ([docs/features/invoicing.md](docs/features/invoicing.md)).
- 6 Explain my price: done; the breakdown line by line and the term comparison ([docs/features/pricing.md](docs/features/pricing.md)).
- 2 Fair early exit: done, on the D31 assumption (below); buy, return and pass on line by line, the unpaid rents cancelled, one final invoice with the VAT of its day ([docs/features/exits.md](docs/features/exits.md)).
- 3 Second-life matchmaking: not yet (wave 3); the refurbishment plan it rests on is built.

## Features

One page per slice under `docs/features/` ([template](docs/features/README.md)); the state of each (missing, in progress, done, verified) is [STATUS.md](docs/features/STATUS.md).

- [Catalogue, asset statuses, demo clock, actor and audit trail](docs/features/catalogue.md)
- [Pricing and quotes](docs/features/pricing.md)
- [The question flow and the application](docs/features/question-flow.md)
- [Contracts: signing and the contract page](docs/features/contracts.md)
- [Invoicing: the schedule, VAT by invoice date, the balance](docs/features/invoicing.md)
- [Exits: buy out, return, pass on and the early exit](docs/features/exits.md)
- [Circular impact and the passport](docs/features/circular-impact.md)
- [Row schemas](docs/features/row-schemas.md)
- [The look: tokens, the price tag, life stamps and drawings](docs/features/look.md)
- [The tamper-evident audit chain](docs/features/audit-chain.md)
- [Company signatories and the signing link](docs/features/signatories.md)
- [Test isolation](docs/features/test-isolation.md)
- [My leases](docs/features/my-leases.md)
- [Second life: assessment, matchmaking and re-pricing](docs/features/second-life.md)

## Team notes

How we work (rules, branches, reviews) and how the app is put together (database, actor, API, events, pages, each slice): [docs/team-notes.md](docs/team-notes.md).
Open questions for the mentors: [docs/mentor-questions.md](docs/mentor-questions.md); decisions: [docs/decisions.md](docs/decisions.md).

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
