// GET  /api/customers/:id/signatories   the company's signatory list with each entry's state today
// POST /api/customers/:id/signatories   body: { name, email, validFrom, validTo }
// D46: the list is seen and changed by the company's own account when it is a signatory, and
// by the admin. The day is the request's (demo clock).
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { addSignatory, listSignatories } from '@/server/signatories';
import { signatoryFailure } from '@/server/signatory-responses';
import { addSignatoryBodySchema, customerIdParamsSchema } from '@/server/signatory-schemas';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/customers/[id]/signatories'>) => {
    const { id } = customerIdParamsSchema.parse(await params);
    const actor = await readActor(db);
    if (actor !== id && actor !== ADMIN_ACTOR) {
      return fail(403, 'NOT_ALLOWED', 'Only the company or the admin sees the list');
    }
    return ok(await listSignatories(db, id, await todayForRequest()));
  }
);

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/customers/[id]/signatories'>) => {
    const { id } = customerIdParamsSchema.parse(await params);
    const body = await readJsonBody(request, addSignatoryBodySchema);
    const today = await todayForRequest();
    const actor = await readActor(db);

    const result = await addSignatory(db, { ...body, customerId: id, actor, today });
    return result.ok ? ok(result.signatory, { status: 201 }) : signatoryFailure(result.reason);
  }
);
