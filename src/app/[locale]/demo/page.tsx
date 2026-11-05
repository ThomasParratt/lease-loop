// The demo page: the clock override that lets the judges run a dated scenario card on its
// own day, and (from wave 1) one button per scenario card that sets the card up and runs it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Badge, Card, DateText, Notice, PageHeader, StaffNote } from '@/components/ui';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readDemoClock } from '@/server/demo-clock';
import { ClockForm } from './clock-form';

/** The dates the scenario cards and the pitch need most: the two hackathon days and the VAT year. */
const PRESET_DAYS = ['2026-11-05', '2026-11-06', '2027-01-01'];

/** CHALLENGE.md section 4. Later waves give each a button that seeds and runs it. */
const SCENARIO_CARDS: MessageKey[] = [
  'demo.card.1',
  'demo.card.2',
  'demo.card.3',
  'demo.card.4',
  'demo.card.5',
  'demo.card.6',
  'demo.card.7',
  'demo.card.8',
  'demo.card.9',
  'demo.card.10',
];

export async function generateMetadata({ params }: PageProps<'/[locale]/demo'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('demo.title') }) };
}

export default async function DemoPage({ params }: PageProps<'/[locale]/demo'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const clock = await readDemoClock();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('demo.title')} intro={t('demo.intro')}>
        <StaffNote>{t('staff.note')}</StaffNote>
      </PageHeader>

      <Card as="section" title={t('demo.clock.title')} titleId="demo-clock">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <p className="text-lg">
            {t('demo.clock.today')}{' '}
            <strong className="font-semibold">
              <DateText iso={clock.today} locale={locale} />
            </strong>
          </p>
          <Badge tone={clock.overridden ? 'warning' : 'success'}>
            {clock.overridden ? t('demo.clock.moved') : t('demo.clock.real')}
          </Badge>
        </div>
        {clock.overridden ? (
          <Notice tone="warning" className="mb-6">
            {t('demo.clock.movedNote', { date: formatIsoDate(clock.systemToday, locale) })}
          </Notice>
        ) : null}
        <ClockForm
          key={clock.today}
          today={clock.today}
          overridden={clock.overridden}
          presets={PRESET_DAYS.map((iso) => ({ iso, label: formatIsoDate(iso, locale) }))}
          labels={{
            date: t('demo.clock.date'),
            dateHint: t('demo.clock.dateHint'),
            travel: t('demo.clock.travel'),
            presets: t('demo.clock.presets'),
            reset: t('demo.clock.reset'),
            pending: t('demo.clock.pending'),
            error: t('demo.clock.error'),
          }}
        />
      </Card>

      <Card as="section" title={t('demo.cards.title')} titleId="demo-cards" className="mt-8">
        <p className="mb-4 text-ink-muted">{t('demo.cards.intro')}</p>
        <ol className="divide-y divide-line">
          {SCENARIO_CARDS.map((key, index) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="mr-2 font-semibold tabular-nums text-ink-muted">{index + 1}.</span>
                {t(key)}
              </span>
              <Badge tone="neutral">{t('demo.cards.soon')}</Badge>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
