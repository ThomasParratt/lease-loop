// Why it's greener: on the left, why leasing an item again saves CO2; on the right, the total
// CO2 and money that items leased again (second and third lives) have saved so far (D15, D80),
// and under it the same totals broken down by category, so the small numbers add up to the big one. Each item's own
// saving is on its passport, reached from the catalogue. A server component: it reads the
// database itself.
import { loadCo2Factors } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { readFleetImpact } from '@/server/asset-events';
import { db } from '@/server/db';
import { InfoPopover } from './ui';

type ImpactStripProps = { today: string; locale: Locale; t: Translate };

export async function ImpactStrip({ today, locale, t }: ImpactStripProps) {
  const [{ fleet, money }, factors] = await Promise.all([
    readFleetImpact(db, today),
    loadCo2Factors(),
  ]);
  const kg = (value: number) => formatNumber(value, locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const centsOf = (category: string) =>
    money.perCategory.find((row) => row.category === category)?.cents ?? 0;

  return (
    <section aria-labelledby="impact-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 id="impact-title" className="text-4xl">
            {t('impact.title')}
          </h2>
          <p className="mt-3 max-w-xl text-lg text-ink-muted">{t('impact.intro')}</p>
        </div>

        <div className="rounded-xl bg-brand-soft p-6 sm:p-8">
          <p className="text-sm font-extrabold tracking-[0.14em] text-brand-text uppercase">
            {t('impact.totalLabel')}
          </p>
          <p className="mt-2 font-heading text-5xl font-semibold text-brand-text tabular-nums sm:text-6xl">
            {t('impact.total', { kg: kg(fleet.totalKg) })}
          </p>
          <p className="mt-3 text-sm font-extrabold tracking-[0.14em] text-brand-text uppercase">
            {t('impact.moneyLabel')}
          </p>
          <p className="mt-1 font-heading text-3xl font-semibold text-brand-text tabular-nums">
            {euro(money.totalCents)}
          </p>
          {/* The breakdown: each total is the sum of these rounded rows (co2.ts, money-saved.ts). */}
          <ul className="mt-5 space-y-2 border-t-2 border-dashed border-brand/30 pt-5 tabular-nums">
            {fleet.perCategory.map((row) => (
              <li key={row.category} className="text-ink">
                {t(`impact.byCategory.${row.category}`, {
                  kg: kg(row.kg),
                  amount: euro(centsOf(row.category)),
                })}
              </li>
            ))}
          </ul>
          <InfoPopover id="co2-method" label={t('impact.how.label')} className="mt-6">
            <p>
              {t('impact.how.body', {
                share: formatNumber(factors.refurbishment_share_of_new * 100, locale),
              })}
            </p>
            <p>{t('impact.how.money')}</p>
          </InfoPopover>
        </div>
      </div>
    </section>
  );
}
