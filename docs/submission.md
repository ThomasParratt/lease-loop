# Submission draft: the PR to the organiser

The text of the pull request from `ThomasParratt/northfina-lease-loop` `main` to `etufillari/northfina-lease-loop` `main`, in the order of the organiser's template (`.github/pull_request_template.md`). Every link is absolute, so it resolves in a PR body on the organiser's repo. The coordinator fills the two placeholders from the README "Status" section on the day, Johannes the team name, and opens it before the 15:00 Helsinki freeze (the organiser records the last commit at 16:00).

Title: `Team <name>: Lease Loop`

---

## Team

| Name     | GitHub          | Main focus                                                                                                 |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| Johannes | `Tonttu84`      | coordination and decisions; pricing, invoicing, contracts, exits, second life, signatories, the demo cards |
| Thomas   | `ThomasParratt` | the asset statuses, the row schemas, the decision race, the question-flow validation, the Sign button      |
| Panu     | `panu-kangas`   | the look, the landing and catalogue pages, the price page, the passport popup, My leases                   |

(From the commit authors on `main`; Johannes checks the focus column before it is sent.)

## What we built

Lease Loop takes one e-bike, laptop or farm machine through three lives: a live price from the list of the day, a question flow that asks only what the amount needs, a contract that locks the price but not the tax, monthly invoices with the VAT of their own date, a fair early exit line by line, and a second life priced by the residual curve and offered to the waiting list by rules. Every item has a passport with its lives and the CO₂ they saved, and every change is a row in a tamper-evident audit chain. It is for Northfina's customers and staff; there is no AI, ML or LLM anywhere in the product.

## The Spine

- [x] Catalogue with today's price
- [x] Price with sliders (term, down payment)
- [x] Application with the question flow
- [x] Contract that locks the price
- [x] Monthly invoices from the contract
- [x] End of term: buy, return or pass on
- [x] Second life: re-price and re-lease

## Smart Problems we picked (at least 2)

<README Smart problems list>

- [x] Wildcard: four things beyond the brief.
  - **The time-travel clock.** One demo clock on the demo page; every date the product uses is read from it once per request, so the judges can stand on 6 November for the price lock, 1 January 2027 for the VAT change and 5 June 2027 for the early exit ([demo-cards.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/demo-cards.md), [catalogue.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/catalogue.md)).
  - **The asset passport.** Each item's lives, contracts, assessments and refurbishments, and the CO₂ each later life saved ([circular-impact.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/circular-impact.md)).
  - **The tamper-evident, sealed audit chain.** Each audit row carries the hash of the one before and an Ed25519 signature made with a key outside the database, and every new head is copied to an anchor file outside it; the audit page shows the head hash and the public key and names the first broken row. `npm run demo:tamper -- --rewrite` recomputes every hash and is still caught, and `npm run audit:anchor` has a public RFC 3161 timestamp authority sign the head (D81, [audit-chain.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/audit-chain.md)).
  - **The signatory link.** A company's signatory list and a one-time signing link for the named person: only the holder of the link signs card 6, and the demo outbox stands in for the e-mail ([signatories.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/signatories.md)).

**What's smart about our solution?** One rounding rule, half up, in one function on integer cents and a factor in millionths; the quote freezes the list version and the net rent while each invoice takes the VAT of its own day; the early exit is the outstanding balance by amortisation, shown line by line; the second-life price is market value plus refurbishment and the waiting list is ranked by four named steps, each place with the step that decided it. Every outcome is a code with params, written in English, Finnish, Swedish or Estonian.

## Scenario cards that work

1, 2, 3, 4, 5, 6, 7, 8, 9, 10

<README Status table>

## How to run the demo

As in the README [Quick start](https://github.com/ThomasParratt/northfina-lease-loop#quick-start):

```bash
npm ci
npm run db:setup
npm run dev
```

Then open `http://localhost:3000/en/demo`: one **Run** button per scenario card, each landing on the page where the numbers are compared, with the demo clock and "Continue as" set for you (run card 1 before card 8). The 10–12 minute walk through it is [docs/demo.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/demo.md).

## Engineering

- [ ] `npm run check:all` passes locally
- [ ] CI is green on our last commit (Actions enabled in our fork)
- [ ] Review finding 1 fixed: the signing link is shown only to admin ([docs/reviews/wave-3.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/reviews/wave-3.md))
- [x] No `--no-verify` was used
- [x] No AI, ML or LLM features inside the app (`npm run check:no-ai`, and `tests/meta-rules.test.ts`)

## Anything else the judges should know?

**Decisions and mentor questions.** Every reading we took is a numbered decision with its reason and what we chose against: [docs/decisions.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/decisions.md) (D1 to D72). Three readings of the brief are open with the mentors ([docs/mentor-questions.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/mentor-questions.md)): the fleet quantity of card 6 (D8, issue #13), passing on to a named person (D16, issue #54) and the price and age a returned seeded item is valued from (D60). Card 8's curve age (D31) is an assumption stated in the README "Status" section.

**Docs.** One page per feature, each with its rule worked on the scenario-card numbers, its decisions, its pure functions and the tests that pin the numbers:

- [docs/features/catalogue.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/catalogue.md)
- [docs/features/pricing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/pricing.md)
- [docs/features/question-flow.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/question-flow.md)
- [docs/features/contracts.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/contracts.md)
- [docs/features/invoicing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/invoicing.md)
- [docs/features/exits.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/exits.md)
- [docs/features/second-life.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/second-life.md)
- [docs/features/circular-impact.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/circular-impact.md)
- [docs/features/signatories.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/signatories.md)
- [docs/features/my-leases.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/my-leases.md)
- [docs/features/demo-cards.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/demo-cards.md)
- [docs/features/audit-chain.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/audit-chain.md)
- [docs/features/row-schemas.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/row-schemas.md)
- [docs/features/test-isolation.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/test-isolation.md)
- [docs/features/look.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/look.md)
- [docs/features/STATUS.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/STATUS.md): the state of every slice

The wave reviews are in [docs/reviews/](https://github.com/ThomasParratt/northfina-lease-loop/tree/main/docs/reviews), the time logs of every task in [docs/log/](https://github.com/ThomasParratt/northfina-lease-loop/tree/main/docs/log).

**How we used AI tools.** The product has none. The code was written with Claude Code: a coordinating session on Claude Fable planned the waves and merged the pull requests, and every agent or session that wrote code or tests ran on Claude Opus (`AGENTS.md`, "Which model does what"; decision D18). Each feature was built in its own worktree on its own branch, test first, then one hardening agent and one review agent after every wave; each pull request was squash-merged as one conventional commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
