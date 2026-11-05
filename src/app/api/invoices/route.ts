// GET /api/invoices?contractId=…
// A contract's invoices in sequence order. Only the contract's customer or admin may read them.
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { contractCustomerId, listInvoices } from '@/server/invoices';
import { listInvoicesQuerySchema } from '@/server/routes';

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const { contractId } = listInvoicesQuerySchema.parse({
    contractId: searchParams.get('contractId') ?? undefined,
  });

  const customerId = await contractCustomerId(db, contractId);
  if (customerId === null) return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
  const actor = await readActor(db);
  if (actor !== ADMIN_ACTOR && actor !== customerId) {
    return fail(403, 'FORBIDDEN', 'Only the customer of this contract may see its invoices');
  }

  return ok(await listInvoices(db, contractId));
});
