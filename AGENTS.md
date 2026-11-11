# Instructions for AI coding agents

Lease Loop began as a hackathon entry: the challenge is in `CHALLENGE.md`, the organiser's engineering rules in `RULES.md`. The hackathon is over and this copy is developed by one person. The code rules below still apply, and `tests/meta-rules.test.ts` (part of `npm test`) enforces most of them: it fails on a file over 600 lines, AI in the app, a domain module without a test, an impure domain file, a route without `handleRoute` or a write outside `withAudit`.

`CHALLENGE.md`, `RULES.md`, `data/DATA.md` and the data pack describe the domain; `docs/decisions.md` records where we chose. Read `data/DATA.md` before using the data pack; the schemas of every data file are in `src/data/schemas.ts`. The hackathon-era documents are history and are no longer updated: `docs/kickoff-brief.md`, `docs/reviews/`, `docs/log/`, `docs/submission.md`, `docs/features/STATUS.md` and the README's "Status" table.

## Code rules

1. **No AI inside the product.** Never add an AI, ML or LLM SDK, model or API call to the app. All product logic is rules, data and algorithms. `npm run check:no-ai` enforces this.
2. **Business logic goes in `src/domain/`** as pure functions: no I/O, no database, no `fetch`, no `Date.now()` / `new Date()` / `Math.random()`. Every function gets Vitest tests next to it, including edge cases; write the test first where you can.
3. **Dates are ISO day strings passed in.** A page or a route calls `todayForRequest(db)` once and passes the day down. The only override is the admin's demo clock on their own session (D94); no endpoint trusts a date from the browser.
4. **Money is integer euro cents and the factor is integer millionths.** Multiply cents by the factor in millionths and divide once, rounding half up to the cent, in one function with the rule in its comment. Never use floating-point euros.
5. **Outcomes are codes with params, never sentences.** The domain returns `{ code, params }`; the page writes it from `src/i18n/messages/{en,fi,sv,et}.json`, with the same keys in all four files.
6. **Nothing is hard-coded to a scenario card.** A test may pin a card's numbers; the code never knows the card exists.
7. **API routes** use `ok()` / `fail()` / `handleRoute()` from `src/server/api-response.ts`, validate with Zod, and have a row in the route table (`src/server/routes.ts`); run `npm run openapi` after changing one. Never return raw error messages or stack traces.
8. **Every data change** goes through `withAudit()` in `src/server/audit.ts`. Use the `tx` it gives you for every write in that change.
9. **Database changes:** edit `prisma/schema.prisma`, then run `npm run db:migrate`. Never hand-write migration SQL.
10. **Files stay under 600 lines.** Split by responsibility.
11. **Every loop ends.** A command, script or test that waits, polls or retries has a hard deadline or an iteration cap and then fails with a message (`timeout 120 …`, or a counted loop). No bare `while true`.
12. **Nothing secret in the repo.** Secrets and passwords go in `.env` (git-ignored, filled by `scripts/ensure-env.mjs`); examples go in `.env.example`.

## Working rules

- **Commits** use conventional messages: `type(scope): subject`. Never use `git commit --no-verify` or `git push --no-verify`; if a hook fails, fix the cause.
- **Branches.** A larger change gets its own branch named `<type>/<topic>` (`feat/bank-id`, `fix/invoices`). Merging it through a pull request is optional, and small changes may go straight to `main`. Never rewrite history that has been pushed.
- **Done means** `npm run check:all` is green (it is what CI runs), the tests of the change are in the same commit, the route table and the OpenAPI file are current, the message keys are in all four files, and the docs below are current.
- **Write it down.**
  - A decision goes into `docs/decisions.md` as a short row: the question, the decision in one or two sentences, why and what was rejected in one sentence, and `decided <date>`. Number it with the next free D number.
  - A feature has a page in `docs/features/<feature>.md`: what it does, the rule with a worked example, the files, the tests that pin it, and the open questions. Keep it current in the same commit as the code; the README's "Features" list links every page.
  - The README's quick start and feature list stay current. No time logs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
