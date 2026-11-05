// POST /api/applications/:id/decision   body: { decision: "approved" | "rejected", reviewedBy }
// D10: an admin decides a manual review; the named signatory signs (approved) or declines an
// awaiting_signatory case, on the company's own account (D39). The actor comes from the actor
// cookie (D17).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { decideApplication } from '@/server/applications';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { decideApplicationBodySchema } from '@/server/routes';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/decision'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, decideApplicationBodySchema);
    const today = await todayForRequest();
    const actor = await readActor(db);

    const result = await decideApplication(db, { id, ...body, today, actor });
    if (result.ok) return ok(result.application);

    switch (result.reason) {
      case 'not_found':
        return fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id');
      case 'not_pending':
        return fail(409, 'APPLICATION_NOT_PENDING', 'The application is already decided');
      case 'admin_only':
        return fail(403, 'ADMIN_ONLY', 'Only an admin decides a manual review');
      case 'not_signatory':
        return fail(403, 'NOT_SIGNATORY', 'Only the named signatory signs for the company');
    }
  }
);
