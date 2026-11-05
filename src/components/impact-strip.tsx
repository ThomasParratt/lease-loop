// Why it's greener: the CO2 the fleet's later lives have saved so far, per category, with a
// link to each such item's passport. A server component: it reads the database itself.
import Link from 'next/link';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { readFleetImpact } from '@/server/asset-events';
import { db } from '@/server/db';
import { LifeStamp } from './ui';

type ImpactStripProps = { today: string; locale: Locale; t: Translate };

export async function ImpactStrip({ today, locale, t }: ImpactStripProps) {
  const { fleet, assets } = await readFleetImpact(db, today);
  const kg = (value: number) => formatNumber(value, locale);

  return (
    <section aria-labelledby="impact-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 id="impact-title" className="text-4xl">
            {t('impact.title')}
          </h2>
          <p className="mt-3 max-w-xl text-lg text-ink-muted">{t('impact.intro')}</p>
          <p className="mt-6 font-heading text-6xl font-semibold text-brand-text tabular-nums">
            {t('impact.total', { kg: kg(fleet.totalKg) })}
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-ink-muted">
            {fleet.perCategory
              .filter((row) => row.assetsWithLaterLife > 0)
              .map((row) => (
                <li key={row.category}>
                  {t('impact.category', {
                    category: t(`category.${row.category}`),
                    kg: kg(row.kg),
                    count: formatNumber(row.assetsWithLaterLife, locale),
                  })}
                </li>
              ))}
          </ul>
        </div>

        <div className="rounded-xl bg-brand-soft p-6 sm:p-8">
          <div aria-hidden="true" className="flex items-center justify-center gap-1 sm:gap-4">
            <LifeStamp
              life={t('stamp.life', { n: 1 })}
              note={t('stamp.new')}
              later={false}
              size="lg"
              tilt={-8}
            />
            <span className="hidden w-10 border-t-4 border-dotted border-line-strong sm:block" />
            <LifeStamp
              life={t('stamp.life', { n: 2 })}
              note={t('stamp.checked')}
              later
              size="lg"
              tilt={6}
            />
            <span className="hidden w-10 border-t-4 border-dotted border-line-strong sm:block" />
            <LifeStamp
              life={t('stamp.life', { n: 3 })}
              note={t('stamp.checked')}
              later
              size="lg"
              tilt={-4}
            />
          </div>
          {assets.length > 0 ? (
            <details className="mt-6">
              <summary className="cursor-pointer font-bold text-brand-text underline decoration-2 underline-offset-4">
                {t('impact.items')}
              </summary>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {assets.map(({ asset, kg: saved }) => (
                  <li key={asset.id}>
                    <Link
                      href={`/${locale}/assets/${asset.id}/passport`}
                      className="text-brand-text underline-offset-4 hover:underline"
                    >
                      {t('impact.itemLink', {
                        name: `${asset.make} ${asset.model}`,
                        kg: kg(saved),
                      })}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
