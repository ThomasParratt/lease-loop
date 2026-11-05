// Why it's greener: the CO2 that items leased again (second and third lives) have saved so far,
// in total and per category. Each item's own saving is on its passport, reached from its page.
// A server component: it reads the database itself.
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { readFleetImpact } from '@/server/asset-events';
import { db } from '@/server/db';
import { LifeStamp } from './ui';

type ImpactStripProps = { today: string; locale: Locale; t: Translate };

export async function ImpactStrip({ today, locale, t }: ImpactStripProps) {
  const { fleet } = await readFleetImpact(db, today);
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
        </div>
      </div>
    </section>
  );
}
