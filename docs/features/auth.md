# Sign-in and sessions

## What it does

Customers and the admin sign in with an e-mail and a password, and the server keeps the session in the database; the actor every page, route and audit row uses is read from that session instead of a cookie that named the actor in clear text. The "continue as" picker, the demo clock and the scenario-card runs stay, behind the admin's sign-in, as tools that change only the admin's own session.

## The rule

- **Sign-in** (`POST /api/session`, `{ email, password }`). The e-mail is compared trimmed and in lower case. The password is checked with scrypt (N 2^15, r 8, p 1, a 16-byte salt per account, constant-time compare). Every failure is the same 401 `INVALID_CREDENTIALS`, after the same scrypt work: a wrong password, an unknown e-mail and a locked account cannot be told apart. More than 20 tries in 15 minutes from one client address are 429 `RATE_LIMITED`.
- **The lock.** Five wrong passwords in a row lock the account for 15 minutes from the fifth; a try during the lock is refused and does not count; the next failure after the lock starts the count again; a correct password clears it. Worked example (`src/server/login.test.ts`): Aino fails at 10:00, 10:01, 10:02, 10:03 and 10:04, so she is locked until **10:19**; her right password at 10:10 is refused, at 10:19 it signs her in and the count goes back to 0. Mikko signs in at 10:05 as usual: the lock is per account.
- **The session.** A random 32-byte token goes into the cookie (`lease-loop-session`, in production `__Host-lease-loop-session` with `Secure`; always `HttpOnly`, `SameSite=Lax`, `Path=/`); the `Session` row stores only its SHA-256. It lasts **24 h** for a customer and **8 h** for the admin from sign-in and is never extended: signed in at 10:00, Aino's session ends at 10:00 the next day, the admin's at 18:00. Every sign-in gets a fresh token, ends the browser's previous session and deletes the account's expired ones. Sign-out (`DELETE /api/session`) deletes the row, so the token opens nothing from then on.
- **Who acts.** `readActor()` answers `anonymous` with no live session, else the account (`admin` or a customer id). The customer type is the record's, never the form's (D92): there is no type to choose at sign-in, and an extra field is a 400.
- **The admin acts as a customer** (`POST /api/actor`, admin only). The admin's session stores the customer (`acting_as`); `readActor()` then answers that customer, so the admin sees and does what they would. Every audit row written in such a request names `admin` as the actor and the customer as `actingAs`: running card 1 writes the quote, the application and the contract as `{ actor: "admin", details: { …, actingAs: "cust-aino" } }`. The policy (D73) is unchanged; D88 still refuses the admin signing as themself.
- **The demo clock and the card runs** are admin only and live on the admin's session (`as_of`); a customer or a visitor gets 403 or 401 and "today" stays the real day for them.
- **Writes from another site** (any method but GET, HEAD and OPTIONS with `Sec-Fetch-Site` other than same-origin or none, or an `Origin` whose host is not ours) are 403 `CROSS_SITE_REQUEST` in `handleRoute`, before the route runs.
- **After sign-in** the browser goes back to `?next=` only when it is a page of this site under the visitor's locale (`safeNextPath`), else to the catalogue.
- **Accounts** are added by the seed: the admin on `ADMIN_EMAIL`, each customer on its record's e-mail, with `ADMIN_PASSWORD` and `CUSTOMER_PASSWORD` from `.env`, which `scripts/ensure-env.mjs` fills with random 24-character passwords. No password is in the repo. The audit log records sign-in (`session.created`), sign-out (`session.ended`), a wrong password (`account.login_failed`), the lock (`account.locked`) and the admin's demo state (`session.demo_state_changed`); no row holds a password, a token or a hash.

## Decisions

- D91 login and sessions, D92 who has a login, D93 the admin acts as a customer, D94 the demo clock and the card runs.
- Replaces the cookie part of D17; narrows D71 and D74 (the demo tools are admin only); keeps D73 (the policy) and D88 (the admin does not sign as themself).

## Pure functions

- `afterFailedLogin(state, now) → { failedAttempts, lockedUntil, lockedNow }`, `isLocked(state, now) → boolean`, `afterSuccessfulLogin() → state` (`src/domain/auth/lockout.ts`). `state` is `{ failedAttempts, lockedUntil: ISO instant | null }`; an unreadable instant counts as locked.
- `sessionExpiry(role, signedInAt) → ISO instant`, `isSessionLive({ expiresAt }, now) → boolean`, `accountRoleSchema` (`src/domain/auth/sessions.ts`).
- `normaliseEmail(email) → string`, `checkNewPassword(password) → { ok } | { ok: false, reason: { code: 'password_too_short' | 'password_too_long', params } }`, 12 to 128 characters (`src/domain/auth/credentials.ts`).
- `attributeAuditEntry(entry, sessionAccount) → entry` (`src/domain/auth/attribution.ts`): unchanged unless the admin's session wrote a row as someone else.
- `safeNextPath(next, locale) → path` (`src/domain/auth/redirect.ts`).

## Files

- Domain: `src/domain/auth/` (above), `src/domain/authz/policy.ts` (`act_as_customer`, `set_demo_clock`, `run_demo_card` admin only).
- Server: `src/server/passwords.ts` (scrypt), `src/server/sessions.ts` (tokens, cookie, `Session` reads and writes), `src/server/accounts.ts` (`Account` reads, `seedAccounts`), `src/server/login.ts` (`logIn`), `src/server/actor.ts` (`readSession`, `readActor`, `sessionState`), `src/server/demo-clock.ts` (`todayForRequest(db)` from the session), `src/server/cross-site.ts`, `src/server/rate-limit.ts`, `src/server/request-context.ts` (the session's account for `withAudit`), `src/server/session-schemas.ts`.
- Routes: `src/app/api/session/route.ts`, `src/app/api/actor/route.ts`, `src/app/api/demo/clock/route.ts`, `src/app/api/demo/cards/[id]/run/route.ts`.
- Pages and components: `src/app/[locale]/login/page.tsx`, `src/components/sign-in-form.tsx`, `src/components/sign-out-button.tsx`, `src/components/actor-picker.tsx` (the admin's picker and "Back to admin"), `src/components/site-header.tsx` (sign in / sign out, the staff strip for the admin only, the acting-as banner), `src/app/[locale]/demo/page.tsx` (admin only).
- Data: `prisma/schema.prisma` (`Account`, `Session`), `prisma/seed.ts`, `scripts/ensure-env.mjs`, `.env.example`.
- Tests: `tests/helpers/sessions.ts` signs a test request in through a real session row.

## Tests that pin the numbers

- `src/domain/auth/lockout.test.ts`: the fifth failure locks for 15 minutes (10:00:04 → 10:15:04), the lock ends at its instant, a failure during it neither counts nor extends it.
- `src/domain/auth/sessions.test.ts`: 24 h and 8 h, across a year end; the expiry instant is already over.
- `src/server/login.test.ts`: the same answer for every failure, the 10:19 unlock, the per-account lock, fresh tokens, no secret in any audit row, the chain still verifies.
- `src/server/passwords.test.ts`: the stored format, salts, NFC, a cost above the cap refused.
- `src/app/api/session/route.test.ts`: the cookie attributes and `Max-Age=86400`, 401 for every failure, 400 for a `type` field, 429 after 20 tries from one address, 403 `CROSS_SITE_REQUEST`, sign-out deletes the row.
- `src/app/api/actor/route.test.ts`, `src/app/api/demo/clock/route.test.ts`, `src/app/api/demo/cards/[id]/run/route.test.ts`: admin only (401, 403 `admin_only`, nothing written), the old `lease-loop-actor=admin` cookie opens nothing, every audit row of card 1's run is the admin's with `actingAs: "cust-aino"`.
- `src/app/api/authz.routes.test.ts` and `src/app/api/applications/route.test.ts`: every write route, now signed in through sessions.

## Open questions

- No idle timeout: the session ends 24 h or 8 h after sign-in whatever happens. An idle timeout needs a write on every request, and every write is an audit row; a separate unaudited "last seen" store would be the way.
- The rate limit is in memory, per server process, and trusts `X-Forwarded-For`: behind a proxy that sets it, it is per client; without one a client can rotate it. The account lock is the durable guard.
- No self-service: no sign-up, password change or reset. A new password goes through `checkNewPassword` when they come.
- A company signs in as the company, on its record's e-mail; one login per signatory (D46) would be the next step.
- The admin acting as a customer can sign for them (D93). It is a demo tool, to be removed with the picker; the audit row says it was the admin.
