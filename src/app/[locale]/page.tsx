// The landing page: what Lease Loop is, the way into the catalogue by category, how the end of
// the term works, and the CO2 the fleet's later lives have saved. The catalogue itself is its
// own page (/catalogue); this page only points there.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { HomeHero } from '@/components/home-hero';
import { HowItWorks } from '@/components/how-it-works';
import { ImpactStrip } from '@/components/impact-strip';
import { ItemArt } from '@/components/item-art';
import { assetCategorySchema } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

/** The model each category's tile is drawn as. */
const TILE_MODEL = { e_bike: 'Urban', laptop: 'Pro', farm_machine: 'Tractor' } as const;

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // the CO2 counter depends on today and the database

  const t = getT(locale);
  const today = await todayForRequest();
  const assets = await listAssets(db);

  return (
    <>
      <HomeHero locale={locale} t={t} />

      <section aria-labelledby="categories-title" className="rule-dashed border-y-2 bg-raised">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="categories-title" className="text-3xl sm:text-4xl">
            {t('home.categories.title')}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {assetCategorySchema.options.map((category) => (
              <li key={category}>
                <Link
                  href={`/${locale}/catalogue?category=${category}`}
                  className="group flex h-full flex-col rounded-xl border-2 border-line p-4 transition-colors hover:border-brand"
                >
                  <span className="block rounded-lg bg-muted px-8 pt-6 pb-1">
                    <ItemArt category={category} model={TILE_MODEL[category]} />
                  </span>
                  <span className="mt-4 flex items-baseline justify-between gap-3">
                    <span className="font-heading text-2xl font-semibold">
                      {t(`category.${category}`)}
                    </span>
                    <span className="text-sm text-ink-muted">
                      {t('catalogue.itemCount', {
                        count: assets.filter((a) => a.category === category).length,
                      })}
                    </span>
                  </span>
                  <span className="mt-1 text-ink-muted">{t(`home.categories.${category}`)}</span>
                  <span className="mt-3 font-bold text-brand-text underline decoration-2 underline-offset-4 group-hover:decoration-brand">
                    {t('home.categories.cta')} <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <HowItWorks t={t} />
      <ImpactStrip today={today} locale={locale} t={t} />
    </>
  );
}
