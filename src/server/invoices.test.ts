// The invoices rows on a real migrated SQLite database: write a schedule, list it, pay one
// (audited, INVOICE_PAID emitted in the same transaction), and a failing handler rolls back.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import { buildSchedule } from '@/domain/invoicing';
import { insertContract, seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { withHandlers } from '../../tests/helpers/with-handlers';
import { withAudit } from './audit';
import { onEvent } from './events';
import {
  contractCustomerId,
  invoiceCustomerId,
  listInvoices,
  payInvoice,
  writeSchedule,
} from './invoices';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let contractId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
withHandlers();
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
  ({ contractId } = await insertContract(db));
  const schedule = buildSchedule({
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: 10_730,
    vatRates: await loadVatRates(),
  });
  if (!schedule.ok) throw new Error('no schedule');
  await withAudit(
    db,
    { actor: 'test', action: 'contract.signed', entityType: 'contract', entityId: contractId },
    (tx) => writeSchedule(tx, contractId, schedule.invoices)
  );
});

describe('writeSchedule and listInvoices', () => {
  it('reads card 1’s schedule back in sequence order', async () => {
    const invoices = await listInvoices(db, contractId);
    expect(invoices.map((i) => i.sequence)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(invoices[35]).toMatchObject({ periodEnd: '2029-11-04', kind: 'rent' });
  });

  it('is empty for an unknown contract', async () => {
    expect(await listInvoices(db, 'nope')).toEqual([]);
  });

  it('refuses a second schedule for the same contract (unique sequence)', async () => {
    const [first] = await listInvoices(db, contractId);
    await expect(
      withAudit(
        db,
        {
          actor: 'test',
          action: 'invoice.rescheduled',
          entityType: 'contract',
          entityId: contractId,
        },
        (tx) =>
          writeSchedule(tx, contractId, [
            { ...first!, kind: 'rent', vatRateBasisPoints: first!.vatRateBasisPoints },
          ])
      )
      // P2002: Prisma's unique-constraint violation on (contract_id, sequence).
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('the access lookups', () => {
  it('names the customer of an invoice and of a contract', async () => {
    const [first] = await listInvoices(db, contractId);
    expect(await invoiceCustomerId(db, first!.id)).toBe('cust-aino');
    expect(await contractCustomerId(db, contractId)).toBe('cust-aino');
    expect(await invoiceCustomerId(db, 'nope')).toBeNull();
    expect(await contractCustomerId(db, 'nope')).toBeNull();
  });
});

describe('payInvoice', () => {
  it('marks it paid, audits it and emits INVOICE_PAID with the gross', async () => {
    const seen: unknown[] = [];
    onEvent('INVOICE_PAID', async (_tx, event) => seen.push(event));
    const [first] = await listInvoices(db, contractId);

    const result = await payInvoice(db, {
      id: first!.id,
      paidOn: '2026-11-06',
      actor: 'cust-aino',
    });

    expect(result).toMatchObject({ ok: true, invoice: { status: 'paid', paidOn: '2026-11-06' } });
    expect(seen).toEqual([
      {
        type: 'INVOICE_PAID',
        invoiceId: first!.id,
        contractId,
        amountCents: 13_466,
        date: '2026-11-06',
      },
    ]);
    const audit = await db.auditLog.findFirst({ where: { entity_id: first!.id } });
    expect(audit).toMatchObject({ action: 'invoice.paid', actor: 'cust-aino' });
  });

  it('answers already_paid the second time and not_found for an unknown id', async () => {
    const [first] = await listInvoices(db, contractId);
    await payInvoice(db, { id: first!.id, paidOn: '2026-11-06', actor: 'cust-aino' });
    expect(await payInvoice(db, { id: first!.id, paidOn: '2026-11-07', actor: 'x' })).toEqual({
      ok: false,
      reason: 'already_paid',
    });
    expect(await payInvoice(db, { id: 'nope', paidOn: '2026-11-07', actor: 'x' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('rolls the payment and its audit row back when an INVOICE_PAID handler throws', async () => {
    onEvent('INVOICE_PAID', async () => {
      throw new Error('handler failed');
    });
    const [first] = await listInvoices(db, contractId);

    await expect(
      payInvoice(db, { id: first!.id, paidOn: '2026-11-06', actor: 'cust-aino' })
    ).rejects.toThrow('handler failed');

    const [after] = await listInvoices(db, contractId);
    expect(after).toMatchObject({ status: 'issued', paidOn: null });
    expect(await db.auditLog.count({ where: { entity_id: first!.id } })).toBe(0);
  });
});
