// POST   /api/actor   body: { "actor": "cust-aino" } to act as a customer, { "actor": "admin" } to stop
// DELETE /api/actor   stops acting as a customer
// The admin's "act as a customer" tool (D93): it changes only the admin's own session, never a
// cookie, and is asked with the session's account, so acting as a customer cannot be used to
// switch to another one without being the admin. 404 while the demo tools are off (D74).
import { ADMIN_ACTOR, ANONYMOUS_ACTOR, readSession, sessionState } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { demoToolsOn } from '@/server/demo-tools';
import { actorBodySchema } from '@/server/session-schemas';
import { setDemoState } from '@/server/sessions';

const NOT_SIGNED_IN = {
  code: 'not_signed_in' as const,
  params: { action: 'act_as_customer' as const },
};
const notFound = () => fail(404, 'NOT_FOUND', 'Not found');

async function adminSession() {
  if (!demoToolsOn()) return { refused: fail(404, 'NOT_FOUND', 'The demo tools are off') };
  const session = await readSession(db);
  const auth = await authorize(db, session?.account ?? ANONYMOUS_ACTOR, 'act_as_customer', {
    none: true,
  });
  if (!auth.ok || !session) {
    return { refused: refusalResponse(auth.ok ? NOT_SIGNED_IN : auth.reason, notFound) };
  }
  return { session };
}

export const POST = handleRoute(async (request) => {
  const { refused, session } = await adminSession();
  if (refused) return refused;
  const { actor } = await readJsonBody(request, actorBodySchema);
  if (actor !== ADMIN_ACTOR && !(await getCustomer(db, actor))) {
    return fail(404, 'UNKNOWN_ACTOR', 'No customer with that id');
  }
  const actingAs = actor === ADMIN_ACTOR ? null : actor;
  return ok(sessionState(await setDemoState(db, session, { actingAs })));
});

export const DELETE = handleRoute(async () => {
  const { refused, session } = await adminSession();
  if (refused) return refused;
  return ok(sessionState(await setDemoState(db, session, { actingAs: null })));
});
