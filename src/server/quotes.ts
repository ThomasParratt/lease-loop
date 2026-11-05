// The stored quote (D7): priced once on the request's day, frozen in a Quote row with its date,
// price-list version and every number, valid 14 days. Reading a quote rebuilds the breakdown
// from the stored numbers and never re-prices it, so a quote seen on a later day (card 2) still
// shows the price it was given.
import { randomUUID } from 'node:crypto';
import type { Quote as QuoteRow } from '@/generated/prisma/client';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import {
  addDays,
  compareTerms,
  breakdownFromFrozen,
  priceQuote,
  QUOTE_VALID_DAYS,
  quoteStatusOn,
  type PricingData,
  type QuoteBreakdown,
  type QuoteInput,
  type QuoteRefusal,
  type QuoteStatus,
  type TermComparison,
} from '@/domain/pricing';
import { quoteRowSchema } from '@/domain/rows/quote';
import { getAsset } from './assets';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';

/** The price lists, the coefficient table and the VAT rates from the data pack. */
export async function loadPricingData(): Promise<PricingData> {
  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  return { priceLists, table, vatRates };
}

export type StoredQuote = {
  id: string;
  quoteDate: string;
  validUntil: string;
  createdAt: string;
  breakdown: QuoteBreakdown;
};

export type CreateQuoteInput = {
  assetId: string;
  quantity: number;
  termMonths: number;
  downPaymentCents: number;
  /** The request's day, from `todayForRequest()`; never from the browser. */
  today: string;
  actor: string;
};

export type CreateQuoteResult =
  | { ok: true; quote: StoredQuote }
  | {
      ok: false;
      reason:
        QuoteRefusal | { code: 'asset_not_available'; params: { assetId: string; status: string } };
    };

/** Database row → stored quote with its breakdown rebuilt from the frozen numbers. */
export function toStoredQuote(row: QuoteRow): StoredQuote {
  return {
    id: row.id,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    createdAt: row.created_at.toISOString(),
    breakdown: breakdownFromFrozen({
      assetId: row.asset_id,
      quantity: row.quantity,
      isoDate: row.quote_date,
      priceListVersion: row.price_list_version,
      unitListPriceCents: row.list_price_cents,
      downPaymentCents: row.down_payment_cents,
      financedCents: row.financed_cents,
      band: row.band,
      factorMillionths: row.factor_millionths,
      termMonths: row.term_months,
      monthlyNetCents: row.monthly_net_cents,
      buyoutCents: row.buyout_cents,
      vatRateBasisPoints: row.vat_rate_bp_at_quote,
    }),
  };
}

/**
 * Prices on `today` and stores the quote with `quote.created` in the audit log, atomically.
 * An asset that is not available (reserved, returned) cannot be quoted; the asset's status is
 * read through the assets slice.
 */
export async function createQuote(
  db: PrismaClient,
  input: CreateQuoteInput,
  data?: PricingData
): Promise<CreateQuoteResult> {
  const pricing = data ?? (await loadPricingData());
  const priced = priceQuote(pricing, {
    assetId: input.assetId,
    quantity: input.quantity,
    termMonths: input.termMonths,
    downPaymentCents: input.downPaymentCents,
    isoDate: input.today,
  });
  if (!priced.ok) return priced;

  const asset = await getAsset(db, input.assetId);
  if (!asset)
    return { ok: false, reason: { code: 'unknown_asset', params: { assetId: input.assetId } } };
  if (asset.status !== 'available') {
    return {
      ok: false,
      reason: { code: 'asset_not_available', params: { assetId: asset.id, status: asset.status } },
    };
  }

  const q = priced.quote;
  const id = randomUUID();
  const validUntil = addDays(input.today, QUOTE_VALID_DAYS);
  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'quote.created',
      entityType: 'quote',
      entityId: id,
      details: {
        assetId: q.assetId,
        quantity: q.quantity,
        termMonths: q.termMonths,
        priceListVersion: q.priceListVersion,
        monthlyNetCents: q.monthlyNetCents,
        validUntil,
      },
    },
    (tx) =>
      tx.quote.create({
        // The row's own rules (D27): a frozen number that does not follow fails here.
        data: parseRow('quote', quoteRowSchema, {
          id,
          asset_id: q.assetId,
          quantity: q.quantity,
          quote_date: input.today,
          valid_until: validUntil,
          price_list_version: q.priceListVersion,
          list_price_cents: q.unitListPriceCents,
          down_payment_cents: q.downPaymentCents,
          financed_cents: q.financedCents,
          band: q.band,
          factor_millionths: q.factorMillionths,
          term_months: q.termMonths,
          monthly_net_cents: q.monthlyNetCents,
          buyout_cents: q.buyoutCents,
          vat_rate_bp_at_quote: q.vatRateBasisPoints,
        }),
      })
  );
  return { ok: true, quote: toStoredQuote(row) };
}

/** The stored quote with its breakdown from the frozen numbers, or null. Never re-prices. */
export async function getQuote(db: PrismaClient, id: string): Promise<StoredQuote | null> {
  const row = await db.quote.findUnique({ where: { id } });
  return row ? toStoredQuote(row) : null;
}

/** Where a stored quote stands on `today`: valid or expired, and whether a cheaper list is live. */
export function storedQuoteStatusOn(
  stored: StoredQuote,
  today: string,
  priceLists: PricingData['priceLists']
): QuoteStatus {
  return quoteStatusOn(
    {
      assetId: stored.breakdown.assetId,
      quoteDate: stored.quoteDate,
      validUntil: stored.validUntil,
      priceListVersion: stored.breakdown.priceListVersion,
      unitListPriceCents: stored.breakdown.unitListPriceCents,
    },
    today,
    priceLists
  );
}

export type QuotePreview = {
  today: string;
  quote: QuoteBreakdown | null;
  refusal: QuoteRefusal | null;
  comparison: TermComparison;
};

/** The live sliders: the breakdown for the chosen term and every term side by side. No write. */
export function previewQuote(
  data: PricingData,
  input: Omit<QuoteInput, 'isoDate'> & { today: string }
): QuotePreview {
  const { today, ...rest } = input;
  const result = priceQuote(data, { ...rest, isoDate: today });
  return {
    today,
    quote: result.ok ? result.quote : null,
    refusal: result.ok ? null : result.reason,
    comparison: compareTerms(data, {
      assetId: rest.assetId,
      quantity: rest.quantity,
      downPaymentCents: rest.downPaymentCents,
      isoDate: today,
    }),
  };
}
