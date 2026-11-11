// POST /api/demo/clock   body: { "asOf": "2026-09-15" } to travel, { "asOf": null } to go back.
// Admin only (D94): sets the demo clock on the admin's own session; every page and route reads
// it once per request through todayForRequest(db). A customer can never move "today".
// 404 while the demo tools are off (D74).
import { ANONYMOUS_ACTOR, readSession } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { demoToolsOn } from '@/server/demo-tools';
import { demoClockBodySchema } from '@/server/routes';
import { setDemoState } from '@/server/sessions';
import { todayIso } from '@/server/today';

const NOT_SIGNED_IN = {
  code: 'not_signed_in' as const,
  params: { action: 'set_demo_clock' as const },
};
const notFound = () => fail(404, 'NOT_FOUND', 'Not found');

export const POST = handleRoute(async (request) => {
  if (!demoToolsOn()) return fail(404, 'NOT_FOUND', 'The demo tools are off');
  const session = await readSession(db);
  const auth = await authorize(db, session?.account ?? ANONYMOUS_ACTOR, 'set_demo_clock', {
    none: true,
  });
  if (!auth.ok || !session) {
    return refusalResponse(auth.ok ? NOT_SIGNED_IN : auth.reason, notFound);
  }
  const { asOf } = await readJsonBody(request, demoClockBodySchema);
  await setDemoState(db, session, { asOf });
  return ok({ asOf, today: asOf ?? todayIso() });
});
