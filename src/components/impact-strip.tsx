// The catalogue's impact strip: the CO2 the fleet's later lives saved so far, per category,
// with a link to each such item's passport. A server component: it reads the database itself.
import Link from 'next/link';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { readFleetImpact } from '@/server/asset-events';
import { db } from '@/server/db';
import { Card } from './ui';

type ImpactStripProps = { today: string; locale: Locale; t: Translate };

export async function ImpactStrip({ today, locale, t }: ImpactStripProps) {
  const { fleet, assets } = await readFleetImpact(db, today);
  const kg = (value: number) => formatNumber(value, locale);

  return (
    <Card as="section" aria-labelledby="impact-title" className="mt-8 bg-success-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id="impact-title" className="text-lg font-bold text-success-ink">
            {t('impact.title')}
          </h2>
          <p className="text-sm text-success-ink">{t('impact.intro')}</p>
        </div>
        <p className="text-3xl font-bold text-success-ink tabular-nums">
          {t('impact.total', { kg: kg(fleet.totalKg) })}
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-success-ink">
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
      {assets.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-success-ink">
            {t('impact.items')}
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {assets.map(({ asset, kg: saved }) => (
              <li key={asset.id}>
                <Link
                  href={`/${locale}/assets/${asset.id}/passport`}
                  className="text-brand-text underline-offset-4 hover:underline"
                >
                  {t('impact.itemLink', { name: `${asset.make} ${asset.model}`, kg: kg(saved) })}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
