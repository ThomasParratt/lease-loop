// The catalogue: every asset, grouped by category, with the net list price on the demo
// clock's day (today unless the demo page moved it).
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { ImpactStrip } from '@/components/impact-strip';
import { Badge, Notice, PageHeader } from '@/components/ui';
import { loadPriceLists } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

export default async function CataloguePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = await todayForRequest(); // read once here; domain code never reads the clock
  const [assets, priceLists] = await Promise.all([listAssets(db), loadPriceLists()]);
  const groups = assetCategorySchema.options
    .map((category) => ({ category, assets: assets.filter((a) => a.category === category) }))
    .filter((group) => group.assets.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('catalogue.title')} intro={t('catalogue.intro')}>
        <Badge tone="success" className="text-sm">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </Badge>
      </PageHeader>
      <ImpactStrip today={today} locale={locale} t={t} />

      {groups.length === 0 ? <Notice tone="warning">{t('catalogue.empty')}</Notice> : null}

      {groups.map((group) => (
        <section
          key={group.category}
          aria-labelledby={`category-${group.category}`}
          className="mt-12"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <h2 id={`category-${group.category}`} className="text-xl font-bold">
              {t(`category.${group.category}`)}
            </h2>
            <p className="text-sm text-ink-muted">
              {t('catalogue.itemCount', { count: group.assets.length })}
            </p>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.assets.map((asset) => (
              <li key={asset.id}>
                <AssetCard
                  asset={asset}
                  price={listPriceOn(priceLists, asset.id, today)}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
