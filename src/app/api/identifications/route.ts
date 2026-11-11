// POST /api/identifications   body: { purpose, applicationId?, next?, locale }
// Starts a strong identification (D95, D96): records the request, puts its random `state` in
// an HttpOnly cookie of this browser, and answers where to go: the broker's page with the state
// and a nonce. To sign a contract the actor must be allowed to sign that application first
// (D73). 404 while no broker is set up (the Test Bank is on only with the demo tools, D97);
// more than 30 starts in 15 minutes from one address are 429.
import { safeNextPath } from '@/domain/auth/redirect';
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { startIdentificationBodySchema } from '@/server/identification-schemas';
import { identificationCookieHeader, startIdentification } from '@/server/identifications';
import { clientAddress, createRateLimiter } from '@/server/rate-limit';
import { testBankAuthorizeUrl, testBankOn } from '@/server/test-bank';

const limiter = createRateLimiter({ limit: 30, windowMs: 15 * 60_000 });

export const POST = handleRoute(async (request) => {
  if (!testBankOn()) return fail(404, 'NOT_FOUND', 'No identification provider is set up');
  const now = new Date().toISOString();
  if (!limiter.hit(clientAddress(request), Date.parse(now))) {
    return fail(429, 'RATE_LIMITED', 'Too many identifications. Wait a few minutes.');
  }
  const body = await readJsonBody(request, startIdentificationBodySchema);
  const actor = await readActor(db);
  let subject: string | null = null;
  if (body.purpose === 'sign_contract') {
    if (!body.applicationId) {
      return fail(400, 'VALIDATION_ERROR', 'Signing needs the application', [
        { path: 'applicationId', message: 'Required', code: 'invalid_type' },
      ]);
    }
    const auth = await authorize(db, actor, 'sign_contract', { application: body.applicationId });
    if (!auth.ok) {
      return refusalResponse(auth.reason, () =>
        fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id')
      );
    }
    subject = body.applicationId;
  }
  const next = safeNextPath(body.next, body.locale);
  const { state, nonce } = await startIdentification(db, {
    purpose: body.purpose,
    subject,
    next,
    actor,
    now,
  });
  return ok(
    { redirectTo: testBankAuthorizeUrl(body.locale, state, nonce) },
    { headers: { 'Set-Cookie': identificationCookieHeader(state) } }
  );
});
