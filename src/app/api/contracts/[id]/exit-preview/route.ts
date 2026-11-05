// GET /api/contracts/:id/exit-preview?mode=return&condition=good&usageValue=1800
// What buying, returning or passing on would cost on the request's day (the demo clock),
// both exits line by line (D14), without writing. The condition and usage are what the
// customer would report; left out, the catalogue's last known values. The contract's customer
// or admin only.
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { readExitContext } from '@/server/exit-data';
import { exitPreviewQuerySchema } from '@/server/exit-schemas';
import { previewExit } from '@/server/exits';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/exit-preview'>) => {
    const { id } = await params;
    const searchParams = new URL(request.url).searchParams;
    const query = exitPreviewQuerySchema.parse({
      mode: searchParams.get('mode') ?? undefined,
      condition: searchParams.get('condition') ?? undefined,
      usageValue: searchParams.get('usageValue') ?? undefined,
    });

    // One read of the contract, its asset and its invoices, passed on to the plan.
    const context = await readExitContext(db, id);
    if (!context) return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
    const actor = await readActor(db);
    if (actor !== ADMIN_ACTOR && actor !== context.contract.customerId) {
      return fail(403, 'FORBIDDEN', 'Only the customer of this contract may see its exit');
    }

    const { asset } = context;
    const reported = {
      condition: query.condition ?? asset.condition,
      usage: { unit: asset.usage.unit, value: query.usageValue ?? asset.usage.value },
    };
    const result = await previewExit(
      db,
      { contractId: id, mode: query.mode, reported, context },
      await todayForRequest()
    );
    if (!result.ok) return fail(422, 'EXIT_REFUSED', 'This exit is not possible', result.reason);
    return ok(result.preview);
  }
);
