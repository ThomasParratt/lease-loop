// Why it's greener: on the left, why leasing an item again saves CO2; on the right, the total
// that items leased again (second and third lives) have saved so far, and under it the same
// total broken down by category, so the small numbers add up to the big one. Each item's own
// saving is on its passport, reached from the catalogue. A server component: it reads the
// database itself.
import { loadCo2Factors } from '@/data/load';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { readFleetImpact } from '@/server/asset-events';
import { db } from '@/server/db';

type ImpactStripProps = { today: string; locale: Locale; t: Translate };

export async function ImpactStrip({ today, locale, t }: ImpactStripProps) {
  const [{ fleet }, factors] = await Promise.all([readFleetImpact(db, today), loadCo2Factors()]);
  const kg = (value: number) => formatNumber(value, locale);

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
          {/* The breakdown: the fleet total is the sum of these rounded rows (co2.ts). */}
          <ul className="mt-5 space-y-2 border-t-2 border-dashed border-brand/30 pt-5 tabular-nums">
            {fleet.perCategory.map((row) => (
              <li key={row.category} className="text-ink">
                {t(`impact.byCategory.${row.category}`, { kg: kg(row.kg) })}
              </li>
            ))}
          </ul>
          <Co2Method
            label={t('impact.how.label')}
            body={t('impact.how.body', {
              share: formatNumber(factors.refurbishment_share_of_new * 100, locale),
            })}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * "How is this counted?": the CO2 method (D15) in a few sentences, shown on hover, on keyboard
 * focus and on a tap (a tap focuses the button). The text is the button's description, so a
 * screen reader reads it with the button; nothing is hidden from it.
 */
function Co2Method({ label, body }: { label: string; body: string }) {
  return (
    <div className="group relative mt-6 inline-block">
      <button
        type="button"
        aria-describedby="co2-method"
        className="inline-flex items-center gap-2 rounded text-sm font-bold text-brand-text underline decoration-2 underline-offset-4"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        {label}
      </button>
      <p
        id="co2-method"
        role="tooltip"
        className="invisible absolute bottom-full left-0 z-10 mb-3 w-80 max-w-[calc(100vw-4rem)] rounded-lg bg-raised p-4 text-sm text-ink opacity-0 shadow-panel transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {body}
      </p>
    </div>
  );
}
