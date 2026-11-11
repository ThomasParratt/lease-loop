# Features

One page per feature, kept current in the same commit as its code and linked from the README's "Features" list (AGENTS.md, working rules). A page says what the feature does, the rule with a worked example, the files, the tests that pin it, and the open questions. The pages written during the hackathon also list their decisions and pure functions, in that older seven-section shape.

- [catalogue.md](catalogue.md): the catalogue with today's price, the asset statuses and their transitions, the demo clock, the actor and the audit trail (wave 0).
- [pricing.md](pricing.md): the price breakdown, the term comparison, the fleet quantity and the stored quote (wave 1).
- [question-flow.md](question-flow.md): the question flow, eligibility and the application decision (wave 1).
- [contracts.md](contracts.md): signing an approved application, the last-unit race and the contract page (wave 2).
- [invoicing.md](invoicing.md): the monthly schedule billed in advance, VAT by invoice date, paying an invoice and the outstanding balance (wave 1).
- [exits.md](exits.md): buy out, return and pass on, the D14 early exit, the market value by the residual curve and the refurbishment plan (wave 2).
- [circular-impact.md](circular-impact.md): the asset passport across lives and the CO2 saved (wave 1).
- [row-schemas.md](row-schemas.md): the write schema of the stored rows and the test that holds them to `schema.prisma` (wave 2).
- [look.md](look.md): the colour roles, the price tag, the life stamp, the drawings and the staff strip (D21).
- [signatories.md](signatories.md): the company's signatory list, the signing link that alone signs card 6, and the admin applying on a customer's behalf (wave 2).
- [audit-chain.md](audit-chain.md): the tamper-evident audit chain, its verifier, the badge with the head hash and the tamper demo (wave 2); the seal: Ed25519 signatures, the anchor file and the timestamp-authority receipt (D81).
- [test-isolation.md](test-isolation.md): how the tests stay independent: one reset, named handlers, no concurrency (D44, wave 2).
- [my-leases.md](my-leases.md): "My leases" in the top navigation, a customer's contracts and unsigned applications (all of them for admin).
- [user-portal.md](user-portal.md): My leases grown into the customer's portal (totals, each contract's ways out, every invoice across the contracts) and `/customers/[id]` for the admin (D75, #28).
- [second-life.md](second-life.md): the assessment of a returned item, the D86 second-life price (the market value) with the refurbish-or-not comparison, the D13 waiting-list match and the third life (wave 3, cards 9 and 10).
- [demo-cards.md](demo-cards.md): one Run button per scenario card on the demo page, through the real services on the card's days, and the demo tools in one place (wave 3).
- [authorization.md](authorization.md): one pure rule for who may do what, checked before the action in every route and service, 401 / 403 `FORBIDDEN` (D73, D74).
- [bank-id.md](bank-id.md): people sign in and sign leases with bank identification, through the mock Test Bank for now (D95 to D97).
- [auth.md](auth.md): sign-in with database sessions, the account lock, and the picker, demo clock and card runs behind the admin's sign-in (D91 to D94).

[STATUS.md](STATUS.md) and the README's "Status" table are the hackathon's record and are no longer updated.
