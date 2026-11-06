# Features

One page per feature slice, shipped in the same pull request as its code (AGENTS.md rule 8) and linked from the README's "Features" list and from the PR body's "Docs" line (rule 10); a stale page is a review finding. Every page has these sections, in this order: **What it does** (two sentences); **The rule** (the formula or rule, with a worked example on the scenario-card numbers); **Decisions** (the D numbers in `docs/decisions.md` it implements); **Pure functions** (inputs and outputs of each domain function); **Files**; **Tests that pin the numbers**; **Open questions**.

- [catalogue.md](catalogue.md): the catalogue with today's price, the demo clock, the actor and the audit trail (wave 0).
- [contracts.md](contracts.md): signing an approved application, the last-unit race and the contract page (wave 2).
- [exits.md](exits.md): buy out, return and pass on, the D14 early exit, the market value by the residual curve and the refurbishment plan (wave 2).
- [circular-impact.md](circular-impact.md): the asset passport across lives and the CO2 saved (wave 1).
- [pricing.md](pricing.md): the price breakdown, the term comparison, the fleet quantity and the stored quote (wave 1).
- [question-flow.md](question-flow.md): the question flow, eligibility and the application decision (wave 1).
- [row-schemas.md](row-schemas.md): the write schema of every stored row and the test that holds them to `schema.prisma`.
- [invoicing.md](invoicing.md): the monthly schedule billed in advance, VAT by invoice date, paying an invoice and the outstanding balance (wave 1).
- [look.md](look.md): the colour roles, the price tag, the life stamp, the drawings and the staff strip (D21).
- [audit-chain.md](audit-chain.md): the tamper-evident audit chain, its verifier, the badge with the head hash and the tamper demo (wave 2).
- [my-leases.md](my-leases.md): "My leases" in the top navigation, a customer's contracts and unsigned applications (all of them for admin).

The team's per-feature state (missing, in progress, done, verified) is [STATUS.md](STATUS.md); the README's "Status" table is the per-card view for the judges.
