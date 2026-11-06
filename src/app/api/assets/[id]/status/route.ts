// PATCH /api/assets/:id/status   body: { "status": "reserved" }
// The admin's manual status change: the actor comes from the actor cookie (D17), only `admin`
// may make it, and it must be one of D22's transitions. Status and audit row in one transaction.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { db } from '@/server/db';
import { changeAssetStatusBodySchema } from '@/server/routes';

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, changeAssetStatusBodySchema);
    const actor = await readActor(db);

    const result = await changeAssetStatus(db, { id, status: body.status, actor });
    if (result.ok) return ok(result.asset);
    if (result.reason === 'not_found') return fail(404, 'ASSET_NOT_FOUND', 'No asset with that id');
    if (result.reason === 'admin_only')
      return fail(403, 'ADMIN_ONLY', 'Only an admin changes an asset status');
    return fail(
      409,
      'ASSET_STATUS_TRANSITION_NOT_ALLOWED',
      'That status change is not allowed',
      result.reason
    );
  }
);
