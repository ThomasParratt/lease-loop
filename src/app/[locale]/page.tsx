// The front page: the short landing (hero), the catalogue with a category filter, how it
// works, and the fleet's CO2 impact. Prices are on the demo clock's day (today unless the demo
// page moved it); each card's monthly price is the standard one: 36 months, nothing down.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { HomeHero } from '@/components/home-hero';
import { HowItWorks } from '@/components/how-it-works';
import { ImpactStrip } from '@/components/impact-strip';
import { Badge, Notice, cx } from '@/components/ui';
import { assetCategorySchema, type AssetCategory } from '@/data/schemas';
import { priceQuote, termsOf } from '@/domain/pricing';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { loadPricingData } from '@/server/quotes';

const CARD_TERM = 36;

export default async function HomePage({ params, searchParams }: PageProps<'/[locale]'>) {
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
      <HomeHero locale={locale} t={t} />

      <section
        id="catalogue"
        aria-labelledby="catalogue-title"
        className="rule-dashed scroll-mt-6 border-t-2"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="catalogue-title" className="text-4xl sm:text-5xl">
                {t('catalogue.title')}
              </h2>
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
                  ? `/${locale}?category=${filter.key}#catalogue`
                  : `/${locale}#catalogue`;
                return (
                  <li key={filter.key ?? 'all'}>
                    <Link
                      href={href}
                      scroll={false}
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
                    monthly={priceQuote(data, {
                      assetId: asset.id,
                      quantity: 1,
                      termMonths,
                      downPaymentCents: 0,
                      isoDate: today,
                    })}
                    termMonths={termMonths}
                    locale={locale}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <HowItWorks t={t} />
      <ImpactStrip today={today} locale={locale} t={t} />
    </>
  );
}
