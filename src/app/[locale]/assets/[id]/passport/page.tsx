// The passport: an item's lives as a timeline (the past lives the data pack counts, then the
// event log), what happened between them, and the CO2 each later life saved (decision D15).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ItemArt } from '@/components/item-art';
import {
  Badge,
  Card,
  DateText,
  DefinitionList,
  InfoPopover,
  LifeStamp,
  Notice,
  PageHeader,
} from '@/components/ui';
import { loadCo2Factors } from '@/data/load';
import type { PassportEvent } from '@/domain/passport';
import { DESIGN_LIFE_MONTHS } from '@/domain/second-life/co2';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { isLocale, type Locale } from '@/i18n/locales';
import { readPassport } from '@/server/asset-events';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/assets/[id]/passport'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('passport.title') }) };
}

function GapEvents({
  title,
  events,
  locale,
  t,
}: {
  title: string;
  events: readonly PassportEvent[];
  locale: Locale;
  t: Translate;
}) {
  if (events.length === 0) return null;
  return (
    <li className="ml-4 border-l-2 border-dashed border-line py-2 pl-5">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {events.map((event) => (
          <li key={event.id} className="flex flex-wrap gap-x-2">
            <DateText iso={event.on_date} locale={locale} className="tabular-nums" />
            <span>{t(`passport.event.${event.kind}`)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function PassportPage({
  params,
}: PageProps<'/[locale]/assets/[id]/passport'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const today = await todayForRequest();
  const [result, factors] = await Promise.all([readPassport(db, id, today), loadCo2Factors()]);
  if (!result) notFound();
  const { asset, passport, co2 } = result;
  const kg = (value: number) => formatNumber(value, locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title={t('passport.title')}
        intro={t('passport.intro', { make: asset.make, model: asset.model })}
        back={{ href: `/${locale}/catalogue`, label: t('passport.back') }}
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">
            <time dateTime={today}>
              {t('passport.asOf', { date: formatIsoDate(today, locale) })}
            </time>
          </Badge>
          <Badge tone="neutral">
            {t('passport.serial')}: {asset.serial_number}
          </Badge>
        </div>
      </PageHeader>

      <div className="mb-10 grid items-center gap-6 sm:grid-cols-[1fr_1fr]">
        <div className="rounded-xl bg-muted px-6 pt-8 pb-2">
          <ItemArt category={asset.category} model={asset.model} />
        </div>
        <div className="rounded-xl bg-brand-soft p-6">
          <p className="font-bold text-success-ink">{t('passport.co2Total')}</p>
          <p className="mt-1 font-heading text-5xl font-semibold text-brand-text tabular-nums">
            {t('passport.kg', { kg: kg(co2.totalKg) })}
          </p>
          {/* The method, as on the landing page: on hover, not under everything else. */}
          <InfoPopover id="co2-method" label={t('impact.how.label')} className="mt-4">
            <p>
              {t('passport.method', {
                footprint: kg(factors.manufacturing_new_kg[asset.category]),
                share: formatNumber(Math.round(factors.refurbishment_share_of_new * 100), locale),
                designLife: DESIGN_LIFE_MONTHS[asset.category],
              })}
            </p>
            <p className="text-ink-muted">{t('passport.noMoney')}</p>
          </InfoPopover>
        </div>
      </div>

      <section aria-labelledby="passport-lives">
        <h2 id="passport-lives" className="mb-4 text-3xl">
          {t('passport.timeline')}
        </h2>
        {passport.lives.length === 0 ? (
          <Notice tone="info">{t('passport.noLives')}</Notice>
        ) : (
          <ol className="space-y-2">
            <GapEvents
              title={t('passport.beforeFirst')}
              events={passport.before}
              locale={locale}
              t={t}
            />
            {passport.lives.map((life) => {
              const saved = co2.perLifeKg[life.index] ?? 0;
              const months =
                life.months === null
                  ? null
                  : t(life.end === null ? 'passport.monthsSoFar' : 'passport.months', {
                      count: formatNumber(life.months, locale),
                    });
              return [
                <li key={`life-${life.index}`}>
                  <Card as="article" aria-labelledby={`life-${life.index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <LifeStamp
                          life={t('stamp.life', { n: life.index + 1 })}
                          note={life.index === 0 ? t('stamp.new') : t('stamp.checked')}
                          later={life.index > 0}
                          tilt={life.index % 2 === 0 ? -8 : 6}
                        />
                        <h3 id={`life-${life.index}`} className="text-2xl">
                          {t('passport.life', { number: life.index + 1 })}
                        </h3>
                      </div>
                      {life.estimated ? null : (
                        <Badge tone={life.end === null ? 'success' : 'neutral'}>
                          {t(`passport.end.${life.endKind ?? 'open'}`)}
                        </Badge>
                      )}
                    </div>
                    {life.estimated ? (
                      <p className="mt-2 text-sm text-ink-muted">
                        {t('passport.pastLife', { months: life.months ?? 0 })}
                      </p>
                    ) : (
                      <DefinitionList
                        variant="grid"
                        className="mt-3"
                        items={[
                          {
                            label: t('passport.dates'),
                            value: t('passport.period', {
                              start: formatIsoDate(life.start!, locale),
                              end: life.end
                                ? formatIsoDate(life.end, locale)
                                : t('passport.ongoing'),
                            }),
                          },
                          ...(months ? [{ label: t('passport.duration'), value: months }] : []),
                          ...(life.contractId
                            ? [{ label: t('passport.contract'), value: life.contractId }]
                            : []),
                        ]}
                      />
                    )}
                    <p className="mt-3 border-t border-line pt-3 text-sm font-medium">
                      {life.index === 0
                        ? t('passport.co2FirstLife')
                        : t('passport.co2Life', { kg: kg(saved) })}
                    </p>
                  </Card>
                </li>,
                <GapEvents
                  key={`gap-${life.index}`}
                  title={t('passport.between')}
                  events={life.between}
                  locale={locale}
                  t={t}
                />,
              ];
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
