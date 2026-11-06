// POST /api/demo/cards/:id/run   (no body)
// Runs scenario card 1 to 10 of CHALLENGE.md section 4 through the real services on the card's
// own days (docs/features/demo-cards.md), then sets the demo clock to the day the judges look
// and the actor to the card's customer, so the landing page opens as the card describes. The
// days come from the card table, never from the browser. A card that already ran is 409
// CARD_ALREADY_RUN with the earlier records' page in `details.landing` (D70).
import { actorCookieHeader } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { demoCardParamsSchema } from '@/server/demo-cards-schemas';
import { runDemoCard } from '@/server/demo-cards';
import { demoClockCookieHeader } from '@/server/demo-clock';

/** The clock and the actor the landing page needs, set on a run and on a refusal alike. */
function withCookies(response: Response, today: string, actor: string): Response {
  response.headers.append('Set-Cookie', demoClockCookieHeader(today));
  response.headers.append('Set-Cookie', actorCookieHeader(actor));
  return response;
}

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/demo/cards/[id]/run'>) => {
    const { id } = demoCardParamsSchema.parse(await params);
    const result = await runDemoCard(db, id);
    if (result.ok) return withCookies(ok(result.run), result.run.today, result.run.actor);

    const { reason, today, actor, landing } = result;
    const response =
      reason.code === 'card_already_run'
        ? fail(409, 'CARD_ALREADY_RUN', 'This card has already run', { ...reason, landing })
        : fail(422, 'CARD_STEP_REFUSED', 'A step of this card was refused', reason);
    return withCookies(response, today, actor);
  }
);
