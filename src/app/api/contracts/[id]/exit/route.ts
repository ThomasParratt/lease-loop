// POST /api/contracts/:id/exit
// body: { "mode": "return", "condition": "good", "usage": { "unit": "km", "value": 1800 } }
// Buys out, returns or passes on the contract on the request's day (the demo clock, never a
// date from the body): sets the status and end day, emits the event, bills the exit and
// cancels the unpaid rents, all in one audited transaction. The customer or admin only.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { exitBodySchema } from '@/server/exit-schemas';
import { exitContract, type ExitServiceRefusal } from '@/server/exits';

const STATUS_OF: Partial<Record<ExitServiceRefusal['code'], number>> = {
  contract_not_found: 404,
  not_allowed: 403,
  contract_not_active: 409,
  next_customer_not_found: 422,
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/exit'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, exitBodySchema);
    const today = await todayForRequest();
    const actor = await readActor(db);

    const { condition, usage, ...choice } = body;
    const result = await exitContract(
      db,
      { ...choice, reported: { condition, usage }, contractId: id, actor },
      today
    );
    if (!result.ok) {
      const status = STATUS_OF[result.reason.code] ?? 422;
      return fail(status, 'EXIT_REFUSED', 'The contract cannot be ended this way', result.reason);
    }
    return ok({ contract: result.contract, plan: result.plan });
  }
);
