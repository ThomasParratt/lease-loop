// A signed contract's summary: the asset, the term with its start and end, and the frozen
// numbers copied from the quote, with the price-lock explanation when today's price list is
// another version (card 2). A server component; the page passes the details and the language.
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ContractDetails } from '@/server/contracts';
import { formatFactor } from './quote-breakdown';
import { Badge, Card, DefinitionList, Money, Notice } from './ui';

type ContractSummaryProps = {
  details: ContractDetails;
  asset: Asset | null;
  locale: Locale;
  t: Translate;
};

export function ContractSummary({ details, asset, locale, t }: ContractSummaryProps) {
  const { contract, quoteDate, priceLock } = details;
  const day = (iso: string) => formatIsoDate(iso, locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  return (
    <div className="space-y-4">
      {priceLock ? (
        <Notice tone="info" title={t('contract.priceLock.title')}>
          <p className="text-sm">
            {t('contract.priceLock.body', {
              quoteDate: day(priceLock.params.quoteDate),
              version: priceLock.params.priceListVersion,
              currentVersion: priceLock.params.currentPriceListVersion,
              currentNet: euro(priceLock.params.currentMonthlyNetCents),
              net: euro(contract.monthlyNetCents),
            })}
          </p>
        </Notice>
      ) : null}
      <Card title={t('contract.terms')}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge status={contract.status}>{t(`contract.status.${contract.status}`)}</Badge>
          <span className="text-sm text-ink-muted">
            {asset ? `${asset.make} ${asset.model}` : contract.assetId}
            {contract.quantity > 1 ? ` × ${contract.quantity}` : ''}
          </span>
        </div>
        <DefinitionList
          variant="grid"
          items={[
            { label: t('contract.signedOn'), value: day(contract.signedOn) },
            {
              label: t('contract.term'),
              value: t('pricing.months', { months: contract.termMonths }),
            },
            { label: t('contract.startDate'), value: day(contract.startDate) },
            { label: t('contract.endDate'), value: day(contract.endDate) },
            { label: t('quote.date'), value: day(quoteDate) },
            {
              label: t('quote.listVersion'),
              value: t('quote.listVersionValue', { version: contract.priceListVersion }),
            },
          ]}
        />
      </Card>
      <Card title={t('contract.price')}>
        <DefinitionList
          items={[
            {
              label: t('pricing.line.unitPrice'),
              value: <Money cents={contract.unitListPriceCents} locale={locale} />,
              numeric: true,
            },
            {
              label: t('pricing.line.downPayment'),
              value: <Money cents={contract.downPaymentCents} locale={locale} />,
              numeric: true,
            },
            {
              label: t('pricing.line.financed'),
              value: <Money cents={contract.financedCents} locale={locale} />,
              numeric: true,
              hint: t('pricing.value.band', {
                band: contract.band,
                factor: formatFactor(contract.factorMillionths, locale),
              }),
            },
            {
              label: t('pricing.line.net'),
              value: <Money cents={contract.monthlyNetCents} locale={locale} />,
              numeric: true,
              total: true,
            },
            {
              label: t('pricing.line.buyout', { months: contract.termMonths }),
              value: <Money cents={contract.buyoutCents} locale={locale} />,
              numeric: true,
            },
          ]}
        />
        <p className="mt-3 text-xs text-ink-muted">
          {t('contract.locked', { version: contract.priceListVersion, date: day(quoteDate) })}
        </p>
      </Card>
    </div>
  );
}
