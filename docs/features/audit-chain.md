# The tamper-evident audit chain

## What it does

Every `AuditLog` row carries the hash of the row before it and its own SHA-256 hash over that plus its canonical content, written inside the same transaction as the change it records. A pure verifier walks the chain and names the first broken row; the audit page shows "Chain intact · N entries · head ab12…ef" or "Chain broken at entry #n (reason)", and `GET /api/audit-log/verify` returns the same verdict.

Tamper-evident, not tamper-proof: someone with write access to the database can still edit a row, but the edit shows; someone who can rewrite the whole table can recompute every hash, which is what anchoring the head hash outside the database answers (see "Open questions").

## The rule

```
hash = SHA-256 hex( prevHash + "\n" + canonicalJson({ actor, action, entityType, entityId, details, createdAt }) )
```

- `prevHash` is the previous row's `hash` (by id); `GENESIS_HASH` (64 zeros) for the first row.
- `canonicalJson`: object keys sorted recursively, arrays in order, no whitespace, `undefined` dropped, numbers and strings as `JSON.stringify` prints them. `details` is hashed as stored, i.e. `JSON.parse(details_json)` (or `null`).
- `createdAt` is the row's ISO instant to the millisecond. `withAudit` sets `created_at` from a `now` it receives (or reads the server clock once, outside the domain), so the time is in the hash and cannot be edited either.

**Worked example (the three rows pinned in `chain.test.ts`):**

| id  | canonical entry (abridged)                                                              | prev_hash   | hash        |
| --- | --------------------------------------------------------------------------------------- | ----------- | ----------- |
| 1   | `{"action":"quote.created","actor":"admin",…,"details":{"monthlyCents":4990}…}`         | `00000000…` | `d8f1fbbe…` |
| 2   | `{"action":"application.submitted","actor":"cust-aino",…,"details":{"quoteId":"Q-1"}…}` | `d8f1fbbe…` | `ef606347…` |
| 3   | `{"action":"contract.signed","actor":"admin",…,"details":null…}`                        | `ef606347…` | `53a1ed15…` |

Head hash: `53a1ed1503f5ee6d6c874237774939b025193a0bb8badbc9df98b9682ffa06d0`.

**What breaks when:**

| Tamper                                                                 | Verdict                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Row 2's details become `{"quoteId":"Q-2"}`                             | broken at 2, `hash_mismatch` (it would now hash to `94b76012…`)                                          |
| Row 1 re-timed, or its actor changed                                   | broken at 1, `hash_mismatch`                                                                             |
| Row 2 deleted                                                          | broken at 3, `prev_hash_mismatch` (3 points at `ef606347…`, sees `d8f1fbbe…`)                            |
| Rows 2 and 3 swapped                                                   | broken at 3, `prev_hash_mismatch`                                                                        |
| Row 2's `prev_hash` edited                                             | broken at 2, `prev_hash_mismatch`                                                                        |
| Row 3's hash set to null                                               | broken at 3, `unhashed_in_chain`                                                                         |
| Every `hash` and `prev_hash` set to null                               | broken at 1, `unhashed_in_chain`                                                                         |
| A second row written with row 1's `prev_hash` (a fork)                 | refused by the database: `prev_hash` is `@unique`                                                        |
| The newest row deleted, or the whole table rewritten with fresh hashes | **not detected inside the database**: the head hash changes, which only an anchor kept elsewhere reveals |

Every row must be hashed. The columns are nullable only so the migration applies to a table with rows; no demo database has rows from before the chain (the seed writes none and `db:reset` reruns every migration), so a null hash anywhere is a break, and nulling every hash cannot pass as an intact log (review on #21).

**Concurrency.** The previous row is read inside the transaction with `orderBy: { id: 'desc' }`. SQLite serialises writers, so two concurrent `withAudit` calls cannot both chain to the same row; the `@unique` on `prev_hash` is the second guard: a fork is two rows with the same `prev_hash`, and the database refuses the second (SQLite allows many nulls under a unique index). `hash` is `@unique` as well. **On Postgres this read needs `SELECT … FOR UPDATE` on the head row or an advisory lock**; without it the unique `prev_hash` turns a fork into a failed transaction to retry.

**Append-only.** `tests/meta-rules.test.ts` fails on any `auditLog.update`, `updateMany`, `upsert`, `delete` or `deleteMany` under `src/` outside tests; the database itself does not forbid it (a trigger would be the next step on Postgres).

### Demo: tamper with the log (not part of the organiser's 15-minute tour)

1. Make a few changes in the app (sign a quote, pay an invoice), open `/en/audit`: the badge says "Chain intact" with the head hash.
2. In a terminal: `npm run demo:tamper` (or `npm run demo:tamper -- --id 3`). It rewrites `details_json` of the newest row (or row 3) straight in the SQLite file with raw SQL, the way someone with database access could, and prints the row and the verdict before and after.
3. Reload `/en/audit`: "Chain broken at entry #3 (its content changed after it was written)". `GET /api/audit-log/verify` says the same.
4. `npm run db:reset` gives a clean chain again.

The script is a terminal tool, never a route, so the app's own write rule holds.

## Decisions

- **D36 (`docs/decisions.md`): a SHA-256 hash chain over canonical JSON, computed in `withAudit` inside the change's transaction, verified by a pure domain function; the head hash shown for a person to anchor.** Reason: the judges score the audit log with money and the envelope; a hash chain is the industry pattern for a tamper-evident trail (certificate transparency, ledger databases), it needs no key management and no outside service, and it fits the existing one-transaction rule. Chosen against:
  - **Signing each row with an application key (HMAC or Ed25519):** stops someone with database access but not the key from recomputing the chain, but needs a secret kept outside the database and rotated; the hackathon has no secret store and a key in `.env` beside `dev.db` would protect nothing. Left as the first next step.
  - **Anchoring the head outside the database (an RFC 3161 timestamp authority or a public ledger):** the only answer to a full rewrite or a truncated tail, but it is an outside call and a running cost; here the head hash is shown for a person to copy. Left as the second next step.
  - **A Merkle tree** instead of a linear chain: cheaper inclusion proofs for one row, not needed at this size; the linear chain is simpler to explain on the page.
  - **Hashing in the server instead of the domain:** the hash is deterministic, so it lives in `src/domain/audit/` with the verifier; the domain may import only `createHash` from `node:crypto` (`eslint.config.mjs` with `allowImportNames`, and the same check in `tests/meta-rules.test.ts`), so `randomUUID` and `randomBytes` stay out.
  - **A legacy prefix of unhashed rows** (rows from before the migration allowed at the start): dropped after review, because nulling every hash would then show as intact.
- RULES.md section 7 (the change and its audit row in one transaction) is kept: the hash is computed in that same transaction.

## Pure functions

`src/domain/audit/` (re-exported from `index.ts`):

- `canonicalJson(value: unknown): string`: the canonical JSON text; throws on a bigint.
- `GENESIS_HASH: string`: 64 zeros.
- `hashAuditEntry(prevHash: string, entry: AuditChainEntry): string`: 64 hex characters. `AuditChainEntry = { actor, action, entityType, entityId, details: unknown, createdAt: string }`.
- `verifyAuditChain(rows: AuditChainRow[]): AuditChainVerdict`: `rows` in id order, each `{ id, prevHash, hash, ...entry }` (the columns are nullable; a null hash is a break); returns `{ ok: true, length, headHash }` or `{ ok: false, brokenAt: id, reason: 'prev_hash_mismatch' | 'hash_mismatch' | 'unhashed_in_chain' }` for the first broken row.

Server reads in `src/server/audit.ts`: `verifyAuditChain(db)` (all rows in id order through the domain verifier), `auditChainHead(db)` (the newest row's hash, or the genesis hash). `withAudit(db, entry, work, now?)` gained the optional `now` (an ISO instant).

## Files

- `prisma/schema.prisma` (`AuditLog.prev_hash String? @unique`, `AuditLog.hash String? @unique`), `prisma/migrations/20261105193302_audit_chain/` (SQL generated by `prisma migrate diff`: `migrate dev` refuses a non-interactive shell when it warns about the unique indexes).
- `src/domain/audit/canonical.ts`, `chain.ts`, `index.ts` and their tests.
- `src/server/audit.ts`, `src/server/audit-schemas.ts`, the row in `src/server/routes.ts`, `docs/openapi.json`.
- `src/app/api/audit-log/verify/route.ts` and `route.test.ts`: read-only, open to every actor like `GET /api/audit-log`.
- `src/components/audit-chain-badge.tsx`, `src/app/[locale]/audit/page.tsx`, the `audit.chain.*` keys in the four message files.
- `scripts/tamper-audit.mjs` (+ test), the `demo:tamper` script in `package.json`.
- `tests/meta-rules.test.ts` (the append-only rule; only `createHash` from `node:crypto` in the domain), `eslint.config.mjs` (the same exception); D36 in `docs/decisions.md`.

## Tests that pin the numbers

- `src/domain/audit/canonical.test.ts`: sorted keys, arrays in order, `undefined` dropped, numbers as JSON prints them, unicode and quotes round-trip, a value and its JSON round trip agree.
- `src/domain/audit/chain.test.ts`: the formula against `createHash` directly; key order does not matter, the time does; the empty log; the three-row chain above; every row of "What breaks when" except the undetectable ones; `unhashed_in_chain` for one nulled row and for a log with every hash nulled; a hashed row without a prev hash.
- `src/server/audit.test.ts` (real migrated SQLite): the first row chains to genesis and the second to the first; `created_at` is the given instant and is in the hash; a failed `work` leaves no row and the next one chains to the last good one; ten writes verify with the head; a raw `UPDATE` of `details_json` or `created_at` is reported at that row; nulling every hash reports row 1; a second row with row 1's `prev_hash` is refused by the unique index.
- `src/app/api/audit-log/verify/route.test.ts`: the empty, intact and broken verdicts through `ok()`, parsed by the contract schema.
- `tests/meta-rules.test.ts`: "no app code updates or deletes audit rows" (checked against a planted `tx.auditLog.deleteMany()` in `src/server/`, then removed); a domain import of anything but `createHash` from `node:crypto` fails the purity rule (checked against a planted `randomUUID` import, then removed).
- `scripts/tamper-audit.test.mjs`: the argument parsing and the rewritten details.

## Open questions

- **Sign each row with an application key** (HMAC-SHA-256 or Ed25519 over the row hash) kept outside the database, so database access alone is not enough to recompute the chain. Needs a secret store and key rotation; not built.
- **Anchor the head outside the database**: publish the head hash periodically to an RFC 3161 timestamp authority or a public ledger, so a truncated tail or a full rewrite is caught. Not built; the page shows the head for a person to copy.
- **Postgres:** the previous-row read needs `SELECT … FOR UPDATE` or an advisory lock, and a trigger could forbid `UPDATE`/`DELETE` on `AuditLog` at the database level.
- `verifyAuditChain(db)` reads the whole table on every audit-page load; fine for the demo, a checkpoint (verified up to id n with head h) would make it incremental.
