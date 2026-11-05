// The invoices slice's rows (docs/kickoff-brief.md section 6: the Invoice table is ours).
// The schedule is computed in src/domain/invoicing and written here at signing, inside the
// signing transaction; paying an invoice is one audited change that emits INVOICE_PAID.
import type { Invoice as InvoiceRow } from '@/generated/prisma/client';
import type { ScheduledInvoice } from '@/domain/invoicing';
import {
  invoiceKindSchema,
  invoiceStatusSchema,
  type InvoiceKind,
  type InvoiceStatus,
} from '@/domain/statuses';
import { invoiceRowSchema } from '@/domain/rows/invoice';
import { withAudit, type TransactionClient } from './audit';
import { emit } from './events';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';

/** An invoice as the API and the pages see it. Money in cents, rates in basis points. */
export type InvoiceView = {
  id: string;
  contractId: string;
  sequence: number;
  kind: InvoiceKind;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string;
  dueDate: string;
  netCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  grossCents: number;
  status: InvoiceStatus;
  paidOn: string | null;
};

/** Row → view. Validates the status-like columns, so a value edited in by hand is caught. */
export function toInvoiceView(row: InvoiceRow): InvoiceView {
  return {
    id: row.id,
    contractId: row.contract_id,
    sequence: row.sequence,
    kind: invoiceKindSchema.parse(row.kind),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    netCents: row.net_cents,
    vatRateBasisPoints: row.vat_rate_bp,
    vatCents: row.vat_cents,
    grossCents: row.gross_cents,
    status: invoiceStatusSchema.parse(row.status),
    paidOn: row.paid_on,
  };
}

/**
 * Inserts a contract's whole schedule, every invoice `issued`. Takes the caller's `tx`: it is
 * always part of a larger audited change (signing), never a change of its own.
 */
export async function writeSchedule(
  tx: TransactionClient,
  contractId: string,
  invoices: readonly ScheduledInvoice[]
): Promise<number> {
  const { count } = await tx.invoice.createMany({
    // Every row parsed first (D27): gross = net + VAT, the period, the status.
    data: invoices.map((invoice) =>
      parseRow('invoice', invoiceRowSchema, {
        contract_id: contractId,
        sequence: invoice.sequence,
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        net_cents: invoice.netCents,
        vat_rate_bp: invoice.vatRateBasisPoints,
        vat_cents: invoice.vatCents,
        gross_cents: invoice.grossCents,
        kind: invoice.kind,
        status: 'issued',
      })
    ),
  });
  return count;
}

/** A contract's invoices in sequence order; empty for an unknown contract. */
export async function listInvoices(db: PrismaClient, contractId: string): Promise<InvoiceView[]> {
  const rows = await db.invoice.findMany({
    where: { contract_id: contractId },
    orderBy: { sequence: 'asc' },
  });
  return rows.map(toInvoiceView);
}

/** The customer an invoice bills, for the access check. Null for an unknown invoice. */
export async function invoiceCustomerId(
  db: PrismaClient,
  invoiceId: string
): Promise<string | null> {
  const row = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { contract: { select: { customer_id: true } } },
  });
  return row?.contract.customer_id ?? null;
}

/** The customer of a contract, for the access check. Null for an unknown contract. */
export async function contractCustomerId(
  db: PrismaClient,
  contractId: string
): Promise<string | null> {
  const row = await db.contract.findUnique({
    where: { id: contractId },
    select: { customer_id: true },
  });
  return row?.customer_id ?? null;
}

/** Thrown inside the transaction when another request paid first, so nothing is written. */
class LostPaymentRace extends Error {}

export type PayInvoiceResult =
  { ok: true; invoice: InvoiceView } | { ok: false; reason: 'not_found' | 'already_paid' };

/**
 * Marks an invoice paid on `paidOn` (the request's today), writes `invoice.paid` to the audit
 * log and emits INVOICE_PAID with the gross amount, all in one transaction. Paying early is
 * allowed (an advance payment); paying twice is an answer, not a crash.
 */
export async function payInvoice(
  db: PrismaClient,
  input: { id: string; paidOn: string; actor: string }
): Promise<PayInvoiceResult> {
  const existing = await db.invoice.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status === 'paid') return { ok: false, reason: 'already_paid' };

  let row: InvoiceRow;
  try {
    row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'invoice.paid',
        entityType: 'invoice',
        entityId: input.id,
        details: {
          sequence: existing.sequence,
          grossCents: existing.gross_cents,
          paidOn: input.paidOn,
        },
      },
      async (tx) => {
        // The status guard in the where makes a concurrent second payment a no-op, not a double.
        const { count } = await tx.invoice.updateMany({
          where: { id: input.id, status: 'issued' },
          data: { status: 'paid', paid_on: input.paidOn },
        });
        if (count === 0) throw new LostPaymentRace();
        await emit(tx, {
          type: 'INVOICE_PAID',
          invoiceId: input.id,
          contractId: existing.contract_id,
          amountCents: existing.gross_cents,
          date: input.paidOn,
        });
        return tx.invoice.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
  } catch (error) {
    if (error instanceof LostPaymentRace) return { ok: false, reason: 'already_paid' };
    throw error;
  }
  return { ok: true, invoice: toInvoiceView(row) };
}
