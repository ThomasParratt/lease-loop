// The catalogue: every item, filtered by category in the URL (`?category=e_bike`). Prices are
// on the demo clock's day (today unless the demo page moved it). Each card shows the item's
// offer at 36 months: one unit with nothing down, or, for an item outside the financing
// limits, what it takes to finance it (several together, or a down payment).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { Badge, Notice, cx } from '@/components/ui';
import { assetCategorySchema, type AssetCategory } from '@/data/schemas';
import { financeOffer, termsOf } from '@/domain/pricing';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { loadPricingData } from '@/server/quotes';

const CARD_TERM = 36;

export default async function CataloguePage({
  params,
  searchParams,
}: PageProps<'/[locale]/catalogue'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = await todayForRequest(); // read once here; domain code never reads the clock
  const [assets, data] = await Promise.all([listAssets(db), loadPricingData()]);
  const termMonths = termsOf(data.table).includes(CARD_TERM) ? CARD_TERM : termsOf(data.table)[0]!;

  const parsed = assetCategorySchema.safeParse((await searchParams).category);
  const selected: AssetCategory | null = parsed.success ? parsed.data : null;
  const shown = selected ? assets.filter((a) => a.category === selected) : assets;
  const filters = [
    { key: null, label: t('catalogue.filter.all'), count: assets.length },
    ...assetCategorySchema.options.map((category) => ({
      key: category,
      label: t(`category.${category}`),
      count: assets.filter((a) => a.category === category).length,
    })),
  ];

  return (
    <>
      <div>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-5xl sm:text-6xl">{t('catalogue.title')}</h1>
              <p className="mt-2 text-lg text-ink-muted">
                {t('catalogue.priceNote', { months: termMonths })}
              </p>
            </div>
            <Badge tone="success" className="text-sm">
              <time dateTime={today}>
                {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
              </time>
            </Badge>
          </div>

          <nav aria-label={t('catalogue.filter.label')} className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {filters.map((filter) => {
                const active = filter.key === selected;
                const href = filter.key
                  ? `/${locale}/catalogue?category=${filter.key}`
                  : `/${locale}/catalogue`;
                return (
                  <li key={filter.key ?? 'all'}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-bold transition-colors',
                        active
                          ? 'border-brand bg-brand text-brand-contrast'
                          : 'border-line-strong text-ink hover:border-brand'
                      )}
                    >
                      {filter.label}
                      <span
                        className={cx(
                          'rounded-full px-2 text-xs tabular-nums',
                          active ? 'bg-brand-contrast text-brand-text' : 'bg-muted'
                        )}
                      >
                        {filter.count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {shown.length === 0 ? (
            <Notice tone="warning" className="mt-8">
              {t('catalogue.empty')}
            </Notice>
          ) : (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((asset) => (
                <li key={asset.id}>
                  <AssetCard
                    asset={asset}
                    offer={financeOffer(data, { assetId: asset.id, termMonths, isoDate: today })}
                    termMonths={termMonths}
                    locale={locale}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
