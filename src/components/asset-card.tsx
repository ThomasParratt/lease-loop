// One catalogue item: its drawing with the life stamp, the make and model, the facts a
// second-hand buyer checks (condition, usage, year), and the monthly price on a small tag.
// A server component: it renders to HTML and ships no JavaScript. The whole card is one link
// (the title's link stretches over it), so there is one tab stop per item.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import type { QuoteResult } from '@/domain/pricing';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { ItemArt } from './item-art';
import { Badge, LifeStamp, Money, PriceTag } from './ui';

type AssetCardProps = {
  asset: Asset;
  /** The standard monthly price (36 months, no down payment) on the demo clock's day. */
  monthly: QuoteResult;
  termMonths: number;
  locale: Locale;
  t: Translate;
};

export function AssetCard({ asset, monthly, termMonths, locale, t }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const life = asset.previous_lives + 1;

  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex h-full flex-col rounded-xl border border-line bg-raised p-3 shadow-item transition-transform focus-within:-translate-y-0.5 hover:-translate-y-0.5"
    >
      <div className="relative rounded-lg bg-muted px-6 pt-8 pb-2">
        <ItemArt category={asset.category} model={asset.model} />
        <LifeStamp
          life={t('stamp.life', { n: life })}
          note={asset.previous_lives === 0 ? t('stamp.new') : t('stamp.checked')}
          later={asset.previous_lives > 0}
          className="absolute top-3 left-3"
        />
        {asset.status !== 'available' ? (
          <Badge
            status={asset.status}
            srPrefix={t('status.label')}
            className="absolute top-3 right-3"
          >
            {t(`status.${asset.status}`)}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-2 pt-4 pb-2">
        <p className="text-xs font-extrabold tracking-[0.14em] text-accent-ink uppercase">
          {asset.make}
        </p>
        <h3 id={headingId} className="mt-1 text-xl leading-snug">
          <Link
            href={`/${locale}/assets/${asset.id}`}
            className="rounded after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {asset.model}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {[
            t(`condition.${asset.condition}`),
            t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) }),
            String(asset.model_year),
          ].join(' · ')}
        </p>

        <div className="mt-auto pt-5">
          {monthly.ok ? (
            <PriceTag
              size="sm"
              className="w-fit min-w-44"
              label={t('catalogue.card.monthly')}
              amount={<Money cents={monthly.quote.monthlyGrossCents} locale={locale} />}
              sub={t('catalogue.card.terms', { months: termMonths })}
            />
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-ink-muted">
              {t(`catalogue.card.${refusalKey(monthly.reason.code)}`)}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function refusalKey(code: string): 'below' | 'above' | 'noPrice' {
  if (code === 'below_minimum') return 'below';
  if (code === 'above_maximum') return 'above';
  return 'noPrice';
}
