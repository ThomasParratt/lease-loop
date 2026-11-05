// The price page: one asset, the sliders with the live breakdown and the term comparison, and,
// with `?quote=<id>`, the stored quote locked at its date and list version (D7, card 2).
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { QuoteBreakdownList } from '@/components/quote-breakdown';
import { QuoteCalculator } from '@/components/quote-calculator';
import {
  Badge,
  Card,
  DefinitionList,
  LinkButton,
  Money,
  Notice,
  PageHeader,
} from '@/components/ui';
import { termsOf, type QuoteStatus } from '@/domain/pricing';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { isLocale, type Locale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import {
  getQuote,
  loadPricingData,
  previewQuote,
  storedQuoteStatusOn,
  type StoredQuote,
} from '@/server/quotes';

const DEFAULT_TERM = 36;

export default async function PricePage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // prices depend on today and the database

  const t = getT(locale);
  const today = await todayForRequest(); // read once here, passed down
  const [assets, data] = await Promise.all([listAssets(db), loadPricingData()]);
  const asset = assets.find((a) => a.id === id);
  if (!asset) notFound();

  const quoteParam = (await searchParams).quote;
  const quoteId = typeof quoteParam === 'string' ? quoteParam : undefined;
  const stored = quoteId ? await getQuote(db, quoteId) : null;
  const storedForAsset = stored && stored.breakdown.assetId === asset.id ? stored : null;

  const price = listPriceOn(data.priceLists, asset.id, today);
  const terms = termsOf(data.table);
  const initial = {
    termMonths: terms.includes(DEFAULT_TERM) ? DEFAULT_TERM : terms[0]!,
    downPaymentCents: 0,
    quantity: 1,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title={`${asset.make} ${asset.model}`}
        intro={t('pricing.page.intro')}
        back={{ href: `/${locale}`, label: t('catalogue.title') }}
        actions={
          <Badge status={asset.status} srPrefix={t('status.label')}>
            {t(`status.${asset.status}`)}
          </Badge>
        }
      >
        <DefinitionList
          variant="grid"
          className="mt-4 max-w-md"
          items={[
            { label: t('condition.label'), value: t(`condition.${asset.condition}`) },
            { label: t('asset.modelYear'), value: String(asset.model_year) },
            {
              label: t('asset.usage'),
              value: t(`usage.${asset.usage.unit}`, {
                value: formatNumber(asset.usage.value, locale),
              }),
            },
            {
              label: t('pricing.page.pricesOn'),
              value: <time dateTime={today}>{formatIsoDate(today, locale)}</time>,
            },
          ]}
        />
      </PageHeader>

      {quoteId && !storedForAsset ? (
        <Notice tone="warning" className="mb-8">
          {t('quote.notFound')}
        </Notice>
      ) : null}
      {storedForAsset ? (
        <StoredQuoteSection
          quote={storedForAsset}
          status={storedQuoteStatusOn(storedForAsset, today, data.priceLists)}
          locale={locale}
          t={t}
        />
      ) : null}

      {price.ok ? (
        <QuoteCalculator
          assetId={asset.id}
          locale={locale}
          terms={terms}
          unitPriceCents={price.priceCents}
          initial={initial}
          initialPreview={previewQuote(data, { assetId: asset.id, ...initial, today })}
          canQuote={asset.status === 'available'}
        />
      ) : (
        <Notice tone="warning">{t('asset.noPrice')}</Notice>
      )}
    </div>
  );
}

function StoredQuoteSection({
  quote,
  status,
  locale,
  t,
}: {
  quote: StoredQuote;
  status: QuoteStatus;
  locale: Locale;
  t: Translate;
}) {
  const b = quote.breakdown;
  return (
    <Card as="section" id="quote" title={t('quote.title')} titleId="quote-title" className="mb-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge status={status.status === 'valid' ? 'quoted' : 'expired'}>
          {t(`quote.status.${status.status}`)}
        </Badge>
        <span className="text-sm text-ink-muted">
          {t('quote.reference', { id: quote.id.slice(0, 8) })}
        </span>
      </div>
      <DefinitionList
        variant="grid"
        className="mb-6"
        items={[
          { label: t('quote.date'), value: formatIsoDate(quote.quoteDate, locale) },
          {
            label: t('quote.listVersion'),
            value: t('quote.listVersionValue', { version: b.priceListVersion }),
          },
          { label: t('quote.validUntil'), value: formatIsoDate(quote.validUntil, locale) },
          { label: t('quote.term'), value: t('pricing.months', { months: b.termMonths }) },
        ]}
      />

      <Notice tone="info" className="mb-4">
        {t('quote.locked', {
          version: b.priceListVersion,
          date: formatIsoDate(quote.quoteDate, locale),
        })}
      </Notice>
      {status.cheaperListLive && status.todayList ? (
        <Notice tone="success" title={t('quote.cheaper.title')} className="mb-4">
          <p>
            {t('quote.cheaper.body', { version: status.todayList.version })}{' '}
            <Money cents={status.todayList.unitPriceCents} locale={locale} />
          </p>
          <LinkButton
            href={`/${locale}/assets/${b.assetId}`}
            variant="secondary"
            size="sm"
            className="mt-3"
          >
            {t('quote.cheaper.action')}
          </LinkButton>
        </Notice>
      ) : null}
      {status.status === 'expired' ? (
        <Notice tone="warning" className="mb-4">
          {t('quote.expiredNotice')}
        </Notice>
      ) : null}

      <QuoteBreakdownList quote={b} locale={locale} t={t} />

      {status.status === 'valid' ? (
        <LinkButton
          href={`/${locale}/apply/${quote.id}`}
          size="lg"
          className="mt-6 w-full sm:w-auto"
        >
          {t('quote.apply')}
        </LinkButton>
      ) : null}
    </Card>
  );
}
