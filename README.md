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

## Team notes

- `AGENTS.md`: the organiser's rules plus our working rules; every agent and person reads it first.
- `docs/kickoff-brief.md`: the plan (scope, decisions, schema ownership, events, waves, the agent brief template).
- `docs/decisions.md`: every decision with its reason; `docs/stack-notes.md`: the traps of this stack; `docs/log/`: one time log per task; `docs/reviews/`: the wave reviews.
- `tests/meta-rules.test.ts`: the engineering rules checked against the repository itself, in `npm test`.
- The practice repo (`ThomasParratt/leasing-platform`) is a read-only parts bin cloned beside this one; port functions with their tests, never structure.

### Database

SQLite through Prisma 7, schema in `prisma/schema.prisma`, `snake_case` columns. Models: `Asset` and `Customer` (both seeded from the data pack by `npm run db:setup`, idempotently), `Quote`, `Application`, `Contract`, `Invoice`, `AssetEvent` (the passport; its autoincrement id is the order), `ReturnAssessment` and `AuditLog`. Who owns and writes each model is `docs/kickoff-brief.md` section 6. Money is integer cents, rent factors integer millionths, VAT rates basis points, business dates ISO day strings. SQLite has no enums: the allowed decisions, contract and invoice statuses, invoice kinds and event kinds are Zod enums in `src/domain/statuses.ts`. Customers are read through `listCustomers` / `getCustomer` in `src/server/customers.ts`, in the `Customer` shape of `src/data/schemas.ts`.

### Who is acting

There is no login (D17). The "continue as" picker (`src/components/actor-picker.tsx`) posts `{ actor }` (a customer id or `admin`) to `POST /api/actor`, which sets the `lease-loop-actor` cookie; `DELETE /api/actor` clears it. Pages and routes call `readActor(db)` from `src/server/actor.ts` once per request and pass the actor to `withAudit`; an unknown or missing cookie reads as `anonymous`.

### Pages

`/[locale]` is the catalogue, `/[locale]/demo` the demo page (the clock and, from wave 1, one button per scenario card), `/[locale]/audit` the newest 50 audit rows. The header nav links all three, beside the language switcher and a slot for the "continue as" actor picker; it wraps on a phone. Pages are built from the kit in `src/components/ui` (`PageHeader`, `Card`, `Button`, `LinkButton`, `Badge`, `DefinitionList`, `Field`, `Notice`, `Money`, `DateText`, `NavLinks`, one `index.ts`) and the team's design tokens in `src/app/globals.css` (D21): pages use the roles `brand`, `focus`, `success`, `warning`, `danger`, `info`, `neutral`, `surface`, `raised`, `muted`, `line`, `line-strong`, `ink`, `ink-muted` (e.g. `bg-brand`, `text-ink-muted`, `bg-success-soft`), never raw colour classes or the scales under them. Each token switches with the colour scheme, so no page needs a `dark:` class.

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
