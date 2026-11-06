// GET /api/applications/:id   The application with its decision and reasons (codes with params).
// Only the applicant customer or the admin reads it; anyone else gets the same 404 as for an
// id that does not exist, so the answer never tells whether the application exists.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getApplication, mayReadApplication } from '@/server/applications';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]'>) => {
    const { id } = await params;
    const actor = await readActor(db);
    const application = await getApplication(db, id);
    if (!application || !mayReadApplication(actor, application)) {
      return fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id');
    }
    return ok(application);
  }
);
