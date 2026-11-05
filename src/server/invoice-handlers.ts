// The invoices slice's event handlers. CONTRACT_SIGNED builds the schedule from the signed
// terms (D2–D5) and writes it in the signing transaction; if the schedule cannot be built (no
// VAT rate on a day) the handler throws and the signing rolls back. Registered at import time;
// src/server/event-handlers.ts imports this module.
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import type { EventOf } from '@/domain/events';
import { buildSchedule } from '@/domain/invoicing';
import type { TransactionClient } from './audit';
import { onEvent } from './events';
import { writeSchedule } from './invoices';

/** Writes the schedule of a just-signed contract, invoice 0 on the signing day (D5). */
export async function handleContractSigned(
  tx: TransactionClient,
  event: EventOf<'CONTRACT_SIGNED'>,
  vatRates?: VatRates
): Promise<number> {
  const schedule = buildSchedule({
    signedOn: event.signedOn,
    startDate: event.startDate,
    termMonths: event.termMonths,
    downPaymentCents: event.downPaymentCents,
    monthlyNetCents: event.netRentCents,
    vatRates: vatRates ?? (await loadVatRates()),
  });
  if (!schedule.ok) {
    throw new Error(`No VAT rate on ${schedule.date} for contract ${event.contractId}`);
  }
  return writeSchedule(tx, event.contractId, schedule.invoices);
}

onEvent('CONTRACT_SIGNED', (tx, event) => handleContractSigned(tx, event));
