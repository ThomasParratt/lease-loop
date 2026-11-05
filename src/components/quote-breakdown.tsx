// "Explain my price": the breakdown of one quote, line by line, in words a 17-year-old and a
// 70-year-old can both follow. No hooks, so the price page (server) and the calculator
// (client) render the same lines. The numbers come from the domain; this only writes them.
import type { QuoteBreakdown, QuoteRefusal } from '@/domain/pricing';
import { formatEuro } from '@/domain/money';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { DefinitionList, Money, type DefinitionItem } from './ui';

/** 27 584 millionths → "0.027584" in the page's language. */
export function formatFactor(millionths: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(millionths / 1_000_000);
}

/** 2550 basis points → "25.5" in the page's language (the message adds the % sign). */
export function formatBasisPoints(basisPoints: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 2 }).format(
    basisPoints / 100
  );
}

/** A refusal code with its params as a sentence; amounts in cents are written as euros. */
export function refusalText(
  t: Translate,
  refusal: Pick<QuoteRefusal, 'code'> & { params: Record<string, unknown> },
  locale: Locale
): string {
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(refusal.params)) {
    if (name.endsWith('Cents') && typeof value === 'number') {
      values[name] = formatEuro(value, intlLocale[locale]);
    } else if (Array.isArray(value)) {
      values[name] = value.join(', ');
    } else if (typeof value === 'string' || typeof value === 'number') {
      values[name] = value;
    }
  }
  const known = [
    'below_minimum',
    'above_maximum',
    'unknown_term',
    'unknown_asset',
    'no_price_list_on_date',
    'down_payment_too_high',
    'invalid_quantity',
    'invalid_down_payment',
    'no_vat_rate_on_date',
    'asset_not_available',
  ] as const;
  const code = known.find((c) => c === refusal.code);
  return code ? t(`pricing.refusal.${code}`, values) : t('pricing.refusal.other');
}

type QuoteBreakdownListProps = { quote: QuoteBreakdown; locale: Locale; t: Translate };

export function QuoteBreakdownList({ quote, locale, t }: QuoteBreakdownListProps) {
  const money = (cents: number) => <Money cents={cents} locale={locale} />;
  const items: DefinitionItem[] = [
    {
      label: t('pricing.line.unitPrice'),
      hint: t('pricing.hint.unitPrice', { version: quote.priceListVersion }),
      value: money(quote.unitListPriceCents),
      numeric: true,
    },
  ];
  if (quote.quantity > 1) {
    items.push({
      label: t('pricing.line.listPrice', { quantity: quote.quantity }),
      value: money(quote.listPriceCents),
      numeric: true,
    });
  }
  items.push(
    {
      label: t('pricing.line.downPayment'),
      hint: t('pricing.hint.downPayment', {
        gross: formatEuro(quote.downPaymentGrossCents, intlLocale[locale]),
      }),
      value: money(quote.downPaymentCents),
      numeric: true,
    },
    {
      label: t('pricing.line.financed'),
      hint: t('pricing.hint.financed'),
      value: money(quote.financedCents),
      numeric: true,
    },
    {
      label: t('pricing.line.band'),
      hint: t('pricing.hint.band'),
      value: t('pricing.value.band', {
        band: quote.band,
        factor: formatFactor(quote.factorMillionths, locale),
      }),
      numeric: true,
    },
    {
      label: t('pricing.line.net'),
      hint: t('pricing.hint.net'),
      value: money(quote.monthlyNetCents),
      numeric: true,
    },
    {
      label: t('pricing.line.vat', {
        rate: formatBasisPoints(quote.vatRateBasisPoints, locale),
      }),
      value: money(quote.monthlyVatCents),
      numeric: true,
    },
    {
      label: t('pricing.line.gross'),
      value: money(quote.monthlyGrossCents),
      numeric: true,
      total: true,
    }
  );
  if (quote.perUnit) {
    items.push({
      label: t('pricing.line.perUnit'),
      hint:
        quote.perUnit.monthlyGrossCents.remainderCents > 0
          ? t('pricing.hint.perUnitRemainder', {
              count: quote.perUnit.monthlyGrossCents.remainderCents,
            })
          : undefined,
      value: money(quote.perUnit.monthlyGrossCents.shareCents),
      numeric: true,
    });
  }
  items.push(
    {
      label: t('pricing.line.buyout', { months: quote.termMonths }),
      hint: t('pricing.hint.buyout', {
        percent: formatBasisPoints(quote.buyoutPercentBasisPoints, locale),
        gross: formatEuro(quote.buyoutGrossCents, intlLocale[locale]),
      }),
      value: money(quote.buyoutCents),
      numeric: true,
    },
    {
      label: t('pricing.line.totalIfReturn'),
      hint: t('pricing.hint.totalIfReturn', { months: quote.termMonths }),
      value: money(quote.totalIfReturnCents),
      numeric: true,
      total: true,
    },
    {
      label: t('pricing.line.totalIfBuy'),
      hint: t('pricing.hint.totalIfBuy'),
      value: money(quote.totalIfBuyCents),
      numeric: true,
      total: true,
    }
  );

  return (
    <>
      <DefinitionList items={items} />
      <p className="mt-3 text-xs text-ink-muted">{t('pricing.vatEstimate')}</p>
    </>
  );
}
