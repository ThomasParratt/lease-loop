// POST /api/invoices/:id/pay   (no body)
// Pays the invoice on the request's day (the demo clock, never a date from the browser), writes
// the audit row and emits INVOICE_PAID in one transaction. The contract's customer or admin.
import '@/server/event-handlers';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { invoiceCustomerId, payInvoice } from '@/server/invoices';

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/invoices/[id]/pay'>) => {
    const { id } = await params;

    const customerId = await invoiceCustomerId(db, id);
    if (customerId === null) return fail(404, 'INVOICE_NOT_FOUND', 'No such invoice');
    const actor = await readActor(db);
    if (actor !== ADMIN_ACTOR && actor !== customerId) {
      return fail(403, 'FORBIDDEN', 'Only the customer of this contract may pay its invoices');
    }

    const result = await payInvoice(db, { id, paidOn: await todayForRequest(), actor });
    if (!result.ok) {
      return result.reason === 'not_found'
        ? fail(404, 'INVOICE_NOT_FOUND', 'No such invoice')
        : fail(409, 'INVOICE_ALREADY_PAID', 'This invoice is already paid');
    }
    return ok(result.invoice);
  }
);
