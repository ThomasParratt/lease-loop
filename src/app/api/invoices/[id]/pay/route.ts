// POST /api/invoices/:id/pay   (no body)
// Pays the invoice on the request's day (the demo clock, never a date from the browser), writes
// the audit row and emits INVOICE_PAID in one transaction. The contract's customer or admin,
// authorized first (D73, D74).
import '@/server/event-handlers';
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { payInvoice } from '@/server/invoices';

const notFound = () => fail(404, 'INVOICE_NOT_FOUND', 'No such invoice');

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/invoices/[id]/pay'>) => {
    const { id } = await params;
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'pay_invoice', { invoice: id });
    if (!auth.ok) return refusalResponse(auth.reason, notFound);

    const result = await payInvoice(db, { id, paidOn: await todayForRequest(), actor });
    if (result.ok) return ok(result.invoice);
    if (result.reason === 'forbidden') return forbiddenResponse(result.refusal);
    return result.reason === 'not_found'
      ? notFound()
      : fail(409, 'INVOICE_ALREADY_PAID', 'This invoice is already paid');
  }
);
