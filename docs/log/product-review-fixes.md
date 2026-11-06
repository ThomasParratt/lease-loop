# Time log: the product review's findings (fix/product-review)

Real clock, Helsinki. Coding session: Opus, in its own worktree, branch `fix/product-review` cut from `main` at `e6362b1`, brief from the coordinator: fix the findings of [docs/reviews/product-review.md](../reviews/product-review.md), phase 1 first, then phase 2 (4, 5, 9) once `fix/authz` merged. Time box 150 minutes.

| When              | What                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 ~07:00 | Review read, base checked, `npm run setup` and `npm run db:setup` (green). Finding 1 traced; the session hit its usage limit before any code.                                                                                          |
| 07:26             | Resumed. Branch renamed, `main` (portal #59) merged. Finding 1: `firstLeaseCurve` (D60 in one pure module) for the assessment and the exit; card 9 and card 10 exit tests, the second lease of a bike ours from new (finding 3, exit). |
| 07:40             | Finding 3: `listAssetsWithLives` for the catalogue and price page stamps. `fix/authz` (#61) merged into the branch.                                                                                                                    |
| 07:50             | Finding 2 (D77): the worse of reported and at-signing condition, `usage_below_signing`, the assessment's optional inspection body.                                                                                                     |
| 07:55             | Findings 6 (business-id hint), 8 (missing key shows the key), 10 (`quote_not_yet_valid` at signing and application).                                                                                                                   |
| 08:00             | Finding 7 (`usageAtLastService`), finding 11 (`AuditHead` row, `head_mismatch`, migration `audit_head`).                                                                                                                               |
| 08:05             | Finding 12 (numeric tie-break, one `MAX_QUANTITY`), 13 (reviewer from the actor, `listCustomers`), 14 (refusal params, unused keys). Phase 2: 4, 5 and 9 written.                                                                      |
| 08:10             | `main` had #62 (another session's 4, 5 and 9): my three phase-2 commits reverted, `main` merged (conflicts: D76/D77 rows, `planContract`, message keys), finding 13 and the signatories label re-applied on #62's forms.               |
| 08:15             | Review status lines, feature pages (exits, second-life, audit-chain, contracts, catalogue, question-flow), this log, `npm run check:all`, PR.                                                                                          |

## Blocked

- The usage limit stopped the first run before any code (about an hour lost).
- Phase 2 was done twice: #62 landed on `main` while this branch had its own 4, 5 and 9. Kept `main`'s, reverted mine.

## Left undone

- Finding 12: the application's age on today (D45 re-checks the start at signing), a company's residency (needs the record's country in the flow), signatory date bounds, the fleet quote on a relisted item (issue #13).
- Finding 13: the demo card's double click (a read before the work).
- Finding 14: page sizes (all under 600), the client-side formatters, "Ready to sign" on the portal, the language switcher's query string (needs a Suspense boundary for `useSearchParams`).
- No UI for the inspection body (D77): the API takes it; the assess button sends none.
- A database migrated with audit rows already in it shows `head_mismatch` until `npm run db:reset`.
