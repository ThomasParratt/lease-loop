# Time log: `feat/auth` (sign-in and sessions, after the hackathon)

Base `main` at `f1a6f44`, the main checkout (a fresh copy: `npm ci` and `npm run db:setup` first). Machine clock, 2026-11-08. Asked for: login for customers and the admin, with the picker and the demo kept behind the admin's sign-in.

| Time  | Step                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 22:05 | Read `actor.ts`, `demo-clock.ts`, the policy, `withAudit`, the route table, the meta rules and the Next.js authentication guide in `node_modules/next/dist/docs/`; `npm ci`, `npm run db:setup`. |
| 22:11 | `3bda280` D91 to D94 in `docs/decisions.md`.                                                                                                                                                     |
| 22:13 | `d74e6bd` the pure rules (lockout, session length, credentials, attribution), tests first; the demo tools admin only in the policy.                                                              |
| 22:15 | `e932502` `Account` and `Session` (`npm run db:migrate`), scrypt, the cross-site check and the request context in `handleRoute`, the rate limit, `withAudit` naming the admin.                   |
| 22:31 | `c8f7fcb` sign-in, sessions, `readActor` and `todayForRequest(db)` from the session, the four routes, the seed and `.env` passwords; the route tests sign in through real session rows.          |
| 22:36 | The sign-in page, sign-out, the admin-only picker and acting-as banner, the demo page guard, `safeNextPath`; the message keys in all four files; checked over HTTP on `next dev` (curl).         |
| 22:40 | The feature page, the README, the demo script, team notes and the pages that said "Continue as"; `npm run check:all` green.                                                                      |

**Blocked.** The copy had no `node_modules` or `.env`. One test timed out under the full suite (21 scrypt checks in one test): the rate-limit test now spends its 20 tries on malformed bodies, which count before the body is read; the scrypt-heavy files have a 30 s test timeout.

**Left undone.** No idle timeout, no sign-up or password reset, one login per company rather than per signatory (the feature page's open questions). Not pushed: the branch is local until it is asked for.
