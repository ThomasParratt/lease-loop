// Signing and reading contracts. `signContract` reads the application, the quote and the asset
// through their owners' read functions, plans the contract with the pure `planContract`, and
// writes it in one `withAudit` transaction: the asset is taken with a conditional write (the
// last-unit race), the contract row is created and CONTRACT_SIGNED is emitted, so the invoices
// and the passport commit or roll back with it.
import { randomUUID } from 'node:crypto';
import { Prisma, type Contract as ContractRow } from '@/generated/prisma/client';
import {
  planContract,
  priceLockOf,
  type PlannedContract,
  type PriceLock,
  type SignRefusal,
} from '@/domain/contracts';
import { priceQuote, type PricingData, type QuoteStatus } from '@/domain/pricing';
import { contractStatusSchema, type ContractStatus } from '@/domain/statuses';
import { ADMIN_ACTOR } from './actor';
import { getApplication } from './applications';
import { getAsset } from './assets';
import { withAudit } from './audit';
import { AssetNotAvailableError, leaseAvailableAsset } from './catalogue-handlers';
import { emit } from './events';
import './event-handlers';
import type { PrismaClient } from './prisma-client';
import { getQuote, loadPricingData, storedQuoteStatusOn, type StoredQuote } from './quotes';

export type ContractView = Omit<PlannedContract, 'status'> & {
  status: ContractStatus;
  endedOn: string | null;
};

/** The contract, its quote day and, when today's list is another version, why the price holds. */
export type ContractDetails = {
  contract: ContractView;
  quoteDate: string;
  priceLock: PriceLock | null;
};

export type SignContractInput = {
  applicationId: string;
  /** The business start day; the signing day when left out. */
  startDate?: string;
  actor: string;
};

export type SignContractRefusal =
  | SignRefusal
  | { code: 'application_not_found'; params: { applicationId: string } }
  | { code: 'not_allowed_to_sign'; params: { applicationId: string } }
  | { code: 'already_signed'; params: { applicationId: string } };

export type SignContractResult =
  { ok: true; details: ContractDetails } | { ok: false; reason: SignContractRefusal };

export function toContractView(row: ContractRow): ContractView {
  return {
    id: row.id,
    number: row.number,
    applicationId: row.application_id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    quantity: row.quantity,
    signedOn: row.signed_on,
    startDate: row.start_date,
    endDate: row.end_date,
    termMonths: row.term_months,
    unitListPriceCents: row.list_price_cents,
    downPaymentCents: row.down_payment_cents,
    financedCents: row.financed_cents,
    band: row.band,
    factorMillionths: row.factor_millionths,
    monthlyNetCents: row.monthly_net_cents,
    buyoutCents: row.buyout_cents,
    vatRateBasisPoints: row.vat_rate_bp_at_signing,
    priceListVersion: row.price_list_version,
    status: contractStatusSchema.parse(row.status),
    endedOn: row.ended_on,
  };
}

/** What the stored quote would cost on `today`'s list, when that list is another version. */
function repricedMonthlyNet(
  stored: StoredQuote,
  status: QuoteStatus,
  today: string,
  data: PricingData
): number | null {
  const { breakdown } = stored;
  if (status.todayList === null || status.todayList.version === breakdown.priceListVersion) {
    return null;
  }
  const repriced = priceQuote(data, {
    assetId: breakdown.assetId,
    quantity: breakdown.quantity,
    termMonths: breakdown.termMonths,
    downPaymentCents: breakdown.downPaymentCents,
    isoDate: today,
  });
  return repriced.ok ? repriced.quote.monthlyNetCents : null;
}

/** Why the contract keeps the quote's price on `today` (card 2), or null when nothing changed. */
function priceLockOn(stored: StoredQuote, today: string, data: PricingData): PriceLock | null {
  const quoteStatus = storedQuoteStatusOn(stored, today, data.priceLists);
  return priceLockOf({
    quote: { ...stored.breakdown, isoDate: stored.quoteDate },
    quoteStatus,
    currentMonthlyNetCents: repricedMonthlyNet(stored, quoteStatus, today, data),
  });
}

/** P2002 on the unique `application_id`: the same application was signed first. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Signs `applicationId` on `today` (the request's day, demo clock included). Only the
 * application's customer or `admin` may sign. Never re-prices: the contract copies the quote.
 */
export async function signContract(
  db: PrismaClient,
  input: SignContractInput,
  today: string,
  data?: PricingData
): Promise<SignContractResult> {
  const { applicationId } = input;
  const application = await getApplication(db, applicationId);
  if (!application) {
    return { ok: false, reason: { code: 'application_not_found', params: { applicationId } } };
  }
  if (input.actor !== application.customerId && input.actor !== ADMIN_ACTOR) {
    return { ok: false, reason: { code: 'not_allowed_to_sign', params: { applicationId } } };
  }
  const alreadySigned = {
    ok: false,
    reason: { code: 'already_signed', params: { applicationId } },
  } as const;
  if (await db.contract.findUnique({ where: { application_id: applicationId } })) {
    return alreadySigned;
  }

  const stored = await getQuote(db, application.quoteId);
  if (!stored) throw new Error(`Application ${applicationId} names a missing quote`);
  const asset = await getAsset(db, stored.breakdown.assetId);
  if (!asset) throw new Error(`Quote ${stored.id} names a missing asset`);
  const pricing = data ?? (await loadPricingData());
  const quoteStatus = storedQuoteStatusOn(stored, today, pricing.priceLists);

  const plan = planContract({
    contractId: randomUUID(),
    applicationId,
    customerId: application.customerId,
    decision: application.decision,
    assetStatus: asset.status,
    quote: { ...stored.breakdown, isoDate: stored.quoteDate, validUntil: stored.validUntil },
    quoteStatus,
    currentMonthlyNetCents: repricedMonthlyNet(stored, quoteStatus, today, pricing),
    signedOn: today,
    startDate: input.startDate ?? today,
  });
  if (!plan.ok) return plan;
  const { contract, event } = plan;

  try {
    const row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: contract.id,
        details: {
          number: contract.number,
          applicationId,
          assetId: contract.assetId,
          quantity: contract.quantity,
          signedOn: contract.signedOn,
          startDate: contract.startDate,
          monthlyNetCents: contract.monthlyNetCents,
          priceListVersion: contract.priceListVersion,
        },
      },
      async (tx) => {
        await leaseAvailableAsset(tx, contract.assetId);
        const created = await tx.contract.create({ data: toContractRowData(contract) });
        await emit(tx, event);
        return created;
      }
    );
    return {
      ok: true,
      details: {
        contract: toContractView(row),
        quoteDate: stored.quoteDate,
        priceLock: plan.priceLock,
      },
    };
  } catch (error) {
    if (error instanceof AssetNotAvailableError) {
      const now = await getAsset(db, contract.assetId);
      return {
        ok: false,
        reason: { code: 'asset_not_available', params: { status: now?.status ?? 'unknown' } },
      };
    }
    if (isUniqueViolation(error)) return alreadySigned;
    throw error;
  }
}

function toContractRowData(contract: PlannedContract) {
  return {
    id: contract.id,
    number: contract.number,
    application_id: contract.applicationId,
    customer_id: contract.customerId,
    asset_id: contract.assetId,
    quantity: contract.quantity,
    signed_on: contract.signedOn,
    start_date: contract.startDate,
    end_date: contract.endDate,
    term_months: contract.termMonths,
    list_price_cents: contract.unitListPriceCents,
    down_payment_cents: contract.downPaymentCents,
    financed_cents: contract.financedCents,
    band: contract.band,
    factor_millionths: contract.factorMillionths,
    monthly_net_cents: contract.monthlyNetCents,
    buyout_cents: contract.buyoutCents,
    vat_rate_bp_at_signing: contract.vatRateBasisPoints,
    price_list_version: contract.priceListVersion,
    status: contractStatusSchema.parse(contract.status),
  };
}

/** One contract by id, or null. The owner's read other slices use (team rule 3). */
export async function getContract(db: PrismaClient, id: string): Promise<ContractView | null> {
  const row = await db.contract.findUnique({ where: { id } });
  return row ? toContractView(row) : null;
}

/** The customer of a contract, for the access checks. Null for an unknown contract. */
export async function contractCustomerId(db: PrismaClient, id: string): Promise<string | null> {
  const row = await db.contract.findUnique({ where: { id }, select: { customer_id: true } });
  return row?.customer_id ?? null;
}

/** One contract with its quote day and price-lock explanation on `today`, or null. */
export async function getContractDetails(
  db: PrismaClient,
  id: string,
  today: string,
  data?: PricingData
): Promise<ContractDetails | null> {
  const row = await db.contract.findUnique({ where: { id } });
  if (!row) return null;
  const application = await getApplication(db, row.application_id);
  const stored = application ? await getQuote(db, application.quoteId) : null;
  if (!stored) throw new Error(`Contract ${id} has no stored quote`);
  const pricing = data ?? (await loadPricingData());
  return {
    contract: toContractView(row),
    quoteDate: stored.quoteDate,
    priceLock: priceLockOn(stored, today, pricing),
  };
}
