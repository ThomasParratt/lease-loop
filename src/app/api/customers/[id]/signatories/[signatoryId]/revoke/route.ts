// POST /api/customers/:id/signatories/:signatoryId/revoke
// D46: ends the signatory's right on the request's day; the last active one cannot be revoked.
import { readActor } from '@/server/actor';
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { revokeSignatory } from '@/server/signatories';
import { signatoryFailure } from '@/server/signatory-responses';
import { signatoryParamsSchema } from '@/server/signatory-schemas';

export const POST = handleRoute(
  async (
    _request,
    { params }: RouteContext<'/api/customers/[id]/signatories/[signatoryId]/revoke'>
  ) => {
    const { id, signatoryId } = signatoryParamsSchema.parse(await params);
    const today = await todayForRequest();
    const actor = await readActor(db);

    const result = await revokeSignatory(db, { customerId: id, signatoryId, actor, today });
    return result.ok ? ok(result.signatory) : signatoryFailure(result.reason);
  }
);
