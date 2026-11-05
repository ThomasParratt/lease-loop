// GET /api/applications/:id   The application with its decision and reasons (codes with params).
import { fail, handleRoute, ok } from '@/server/api-response';
import { getApplication } from '@/server/applications';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]'>) => {
    const { id } = await params;
    const application = await getApplication(db, id);
    if (!application) return fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id');
    return ok(application);
  }
);
