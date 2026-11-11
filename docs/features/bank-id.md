# Bank identification

## What it does

Consumers and sole traders sign in with strong identification through their bank instead of a password, and identify again to sign a lease, so a signature belongs to a verified person and not just to an open browser. Until a real identification broker is set up, a mock "Test Bank" plays the broker, only while the demo tools are on.

## The rule

- **The flow** is the OpenID Connect shape a Finnish identification broker uses. `POST /api/identifications` records a request and puts a random `state` in an HttpOnly cookie of this browser; the browser goes to the broker's page with that state and a `nonce`. The broker sends it back to `GET /api/identifications/callback` with a single-use code. The callback completes the request only if the same browser brings the same state within **10 minutes**, once, and the code redeems to the nonce we gave. Every outcome is a 303 redirect to a page of this site.
- **Who it is.** The broker names the person by their personal identity code. The account stores only an HMAC-SHA256 of it, keyed with `IDENTITY_HASH_KEY` from `.env`. A plain hash would not do: there are only a few billion codes. The code is never stored or logged.
- **Sign-in.** The account linked to that HMAC gets a session, exactly as a password sign-in does (D91). A person's password never signs them in, even one stored before this change; the admin and companies keep their passwords.
- **Signing.** `POST /api/contracts` from a person needs `identificationId`: a completed identification for this application, of the applicant, at most **10 minutes** old, never used. It is used in the signing transaction, and the `contract.signed` audit row records the method and the broker's transaction id. Example (`src/app/api/identifications/route.test.ts`): Aino's browser identifies at the Test Bank as Mikko, then tries to sign Aino's lease, and gets 403 `IDENTIFICATION_REQUIRED` with `identification_other_person`. No contract is written.
- **The Test Bank** lists the data pack's people, each with an artificial identity code (individual numbers 900 to 999, which no real person has): Aino Virtanen is `120497-9001`. It shows a warning that it is test identification, and it looks like Lease Loop, not like any bank. Off with the demo tools, so a production build has no bank sign-in until a real broker is added.

## Decisions

D95 (bank identification for people), D96 (identify again to sign), D97 (the Test Bank). Builds on D91 (sessions) and D73 (who may sign).

## Files

- Domain: `src/domain/identity/personal-code.ts` (`parsePersonalCode`, `testPersonalCode`), `src/domain/identity/identification.ts` (`checkCallback`, `checkForSigning`, `signsInWithBank`), `src/domain/auth/redirect.ts` (`withQueryParam`, `localeOfPath`).
- Server: `src/server/identifications.ts` (start, complete, use), `src/server/identity-hash.ts`, `src/server/test-bank.ts` (the mock broker), `src/server/signing-identification.ts` (for the application page), `src/server/accounts.ts` (`findAccountByIdentity`, the seed), `src/server/login.ts` (`openSession`, people refused), `src/server/contracts.ts` (uses the identification).
- Routes: `src/app/api/identifications/route.ts`, `src/app/api/identifications/callback/route.ts`, `src/app/api/test-bank/authorize/route.ts`, `src/app/api/contracts/route.ts`.
- Pages: `src/app/[locale]/test-bank/`, `src/app/[locale]/login/page.tsx`, `src/components/bank-identify-button.tsx`, `src/components/sign-contract-form.tsx`.
- Data: `Account.identity_hash`, nullable `Account.password_hash`, the `Identification` model.

## Tests that pin it

- `src/domain/identity/personal-code.test.ts`: the check character (`131052-308T`), the century signs, 29 February, Mikko's artificial `100309A9007`.
- `src/domain/identity/identification.test.ts`: the 10-minute request, the exact 10-minute signing bound, each refusal code.
- `src/app/api/identifications/route.test.ts`: the whole flow. It covers the session, the code never stored, another browser, a replayed callback, a wrong nonce, an expired or cancelled request, a person with no account, no company at the Test Bank, a foreign `next`, 404 with the demo tools off, and signing with your own, someone else's, a sign-in or a used identification.
- `src/server/login.test.ts`: a person's password is refused, old hash or not. `src/server/accounts.test.ts`: people are linked with no password, companies get one.

## Open questions

- A real broker: register with one, put its client secret in `.env`, and replace `src/server/test-bank.ts` with its token exchange. That means verifying the signed ID token instead of an in-process code.
- Companies: a bank ID proves a person, not a company. A company's signatories are stored with the company's name (D46), so neither a company sign-in nor the signing link can check a person yet. Storing signatories as people comes first.
- The admin acting as a customer (D93) can pass the Test Bank as that customer; a real broker would refuse it.
- The application still takes the birth date as typed (D38). The verified birth date could replace it.
- The scenario-card runs and the tests' journeys sign through the service directly, so they bring no identification. The check sits in the route.
