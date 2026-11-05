// PATCH /api/assets/:id/status   body: { "status": "reserved", "actor": "team-kettu" }
// Changes the status and writes an audit row in the same transaction.
// There is no login in the starter, so `actor` is whatever the caller says.
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { db } from '@/server/db';
import { changeAssetStatusBodySchema } from '@/server/routes';

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, changeAssetStatusBodySchema);

    const result = await changeAssetStatus(db, { id, status: body.status, actor: body.actor });
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    return ok(result.asset);
  }
);
