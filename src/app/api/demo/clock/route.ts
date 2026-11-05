// POST /api/demo/clock   body: { "asOf": "2026-09-15" } to travel, { "asOf": null } to go back.
// Sets or clears the demo clock cookie; every page and route reads it once per request
// through todayForRequest(). The only endpoint that accepts a date from the browser.
import { cookies } from 'next/headers';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { DEMO_CLOCK_COOKIE } from '@/server/demo-clock';
import { demoClockBodySchema } from '@/server/routes';
import { todayIso } from '@/server/today';

export const POST = handleRoute(async (request) => {
  const { asOf } = await readJsonBody(request, demoClockBodySchema);
  const store = await cookies();

  if (asOf === null) {
    store.delete(DEMO_CLOCK_COOKIE);
    return ok({ asOf: null, today: todayIso() });
  }

  store.set(DEMO_CLOCK_COOKIE, asOf, { path: '/', sameSite: 'lax', httpOnly: true });
  return ok({ asOf, today: asOf });
});
