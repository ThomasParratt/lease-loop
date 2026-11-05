// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import type { ListPriceResult } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { Badge, Card, DefinitionList, Money } from './ui';

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  locale: Locale;
  t: Translate;
};

export function AssetCard({ asset, price, locale, t }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;

  return (
    <Card
      as="article"
      aria-labelledby={headingId}
      className="flex h-full flex-col transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{asset.make}</p>
          <h3 id={headingId} className="text-lg leading-snug font-bold">
            {asset.model}
          </h3>
        </div>
        <Badge status={asset.status} srPrefix={t('status.label')}>
          {t(`status.${asset.status}`)}
        </Badge>
      </div>

      <DefinitionList
        variant="grid"
        className="mt-4 mb-5"
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
            label: t('asset.previousLives'),
            value: formatNumber(asset.previous_lives, locale),
            numeric: true,
          },
        ]}
      />

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
        <div className="text-xs text-ink-muted">
          <p>{t('asset.listPrice')}</p>
          {price.ok ? (
            <p>{t('asset.priceListVersion', { version: price.priceListVersion })}</p>
          ) : null}
          <Link
            href={`/${locale}/assets/${asset.id}/passport`}
            className="text-brand-text underline-offset-4 hover:underline"
          >
            {t('passport.link')}
          </Link>
        </div>
        <p className="text-right text-xl font-semibold">
          {price.ok ? <Money cents={price.priceCents} locale={locale} /> : t('asset.noPrice')}
        </p>
      </div>
      <Link
        href={`/${locale}/assets/${asset.id}`}
        className="mt-3 text-sm font-medium text-brand-text underline underline-offset-4"
      >
        {t('pricing.card.seePrice')}
      </Link>
    </Card>
  );
}
