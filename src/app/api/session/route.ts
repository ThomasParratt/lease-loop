// GET    /api/session   who is signed in, who the request acts as, the demo clock (D91)
// POST   /api/session   body: { "email": "…", "password": "…" }   signs in, sets the cookie
// DELETE /api/session   signs out: ends the session and clears the cookie
// Every failed sign-in is the same 401 INVALID_CREDENTIALS (an unknown e-mail, a locked
// account and a wrong password look alike); more than 20 tries in 15 minutes from one address
// are 429 RATE_LIMITED. Writes from another site are refused by handleRoute.
import { readSession, readSessionToken, sessionState } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { logIn } from '@/server/login';
import { clientAddress, createRateLimiter } from '@/server/rate-limit';
import { logInBodySchema } from '@/server/session-schemas';
import {
  clearSessionCookieHeader,
  endSession,
  findLiveSession,
  sessionCookieHeader,
} from '@/server/sessions';

const SIGN_IN_WINDOW_MS = 15 * 60_000;
const SIGN_IN_TRIES = 20;
const limiter = createRateLimiter({ limit: SIGN_IN_TRIES, windowMs: SIGN_IN_WINDOW_MS });

export const GET = handleRoute(async () => ok(sessionState(await readSession(db))));

export const POST = handleRoute(async (request) => {
  const now = new Date().toISOString();
  if (!limiter.hit(clientAddress(request), Date.parse(now))) {
    return fail(429, 'RATE_LIMITED', 'Too many sign-in attempts. Wait a few minutes.');
  }
  const { email, password } = await readJsonBody(request, logInBodySchema);
  const result = await logIn(db, { email, password, previousToken: await readSessionToken() }, now);
  if (!result.ok) return fail(401, 'INVALID_CREDENTIALS', 'The e-mail or the password is wrong');
  const session = await findLiveSession(db, result.token, now);
  const maxAge = (Date.parse(result.expiresAt) - Date.parse(now)) / 1000;
  return ok(sessionState(session), {
    headers: { 'Set-Cookie': sessionCookieHeader(result.token, maxAge) },
  });
});

export const DELETE = handleRoute(async () => {
  const session = await readSession(db);
  if (session) await endSession(db, session);
  return ok(sessionState(null), { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
});
