// POST /api/demo/cards/:id/run   (no body)
// Admin only (D94). Runs scenario card 1 to 10 of CHALLENGE.md section 4 through the real
// services on the card's own days (docs/features/demo-cards.md), then sets the admin's session
// to the day the judges look and to act as the card's customer (none for the admin's cards),
// so the landing page opens as the card describes. The days come from the card table, never
// from the browser. A card that already ran is 409 CARD_ALREADY_RUN with the earlier records'
// page in `details.landing` (D70). Answers 404 while the demo tools are off (D74). Every audit
// row of the run names the admin, with the card's customer as `actingAs` (D93).
import { ADMIN_ACTOR, ANONYMOUS_ACTOR, readSession } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { demoCardParamsSchema } from '@/server/demo-cards-schemas';
import { runDemoCard } from '@/server/demo-cards';
import { demoToolsOn } from '@/server/demo-tools';
import { setDemoState, type SessionView } from '@/server/sessions';

const NOT_SIGNED_IN = {
  code: 'not_signed_in' as const,
  params: { action: 'run_demo_card' as const },
};
const notFound = () => fail(404, 'NOT_FOUND', 'Not found');

/** The clock and the customer the landing page needs, set on a run and on a refusal alike. */
async function landOn(session: SessionView, today: string, actor: string): Promise<void> {
  await setDemoState(db, session, { asOf: today, actingAs: actor === ADMIN_ACTOR ? null : actor });
}

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/demo/cards/[id]/run'>) => {
    if (!demoToolsOn()) return fail(404, 'NOT_FOUND', 'The demo tools are off');
    const session = await readSession(db);
    const auth = await authorize(db, session?.account ?? ANONYMOUS_ACTOR, 'run_demo_card', {
      none: true,
    });
    if (!auth.ok || !session) {
      return refusalResponse(auth.ok ? NOT_SIGNED_IN : auth.reason, notFound);
    }
    const admin = session;
    const { id } = demoCardParamsSchema.parse(await params);
    const result = await runDemoCard(db, id);
    if (result.ok) {
      await landOn(admin, result.run.today, result.run.actor);
      return ok(result.run);
    }
    const { reason, today, actor, landing } = result;
    await landOn(admin, today, actor);
    return reason.code === 'card_already_run'
      ? fail(409, 'CARD_ALREADY_RUN', 'This card has already run', { ...reason, landing })
      : fail(422, 'CARD_STEP_REFUSED', 'A step of this card was refused', reason);
  }
);
