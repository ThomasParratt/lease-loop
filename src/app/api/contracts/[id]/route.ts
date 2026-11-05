// GET /api/contracts/:id
// A contract with its frozen price, its quote day and, when today's list is another version,
// why the price holds (card 2). Only the contract's customer or admin may read it.
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { contractCustomerId, getContractDetails } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const customerId = await contractCustomerId(db, id);
    if (customerId === null) return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
    const actor = await readActor(db);
    if (actor !== ADMIN_ACTOR && actor !== customerId) {
      return fail(403, 'FORBIDDEN', 'Only the customer of this contract may see it');
    }

    const details = await getContractDetails(db, id, await todayForRequest());
    if (!details) return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
    return ok(details);
  }
);
