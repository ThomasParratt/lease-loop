// The customer portal (D75): everything of one customer in one place. The totals line, the
// contracts with the ways out that apply today (links to the contract page's exit section),
// the applications not signed yet, and every invoice across the contracts: open first, with a
// Pay link to the contract page where paying lives, then upcoming, paid and cancelled. The
// leases page mounts it for the acting customer, /customers/[id] for the admin.
import Link from 'next/link';
import { Badge, Disclosure, Notice } from '@/components/ui';
import { formatEuro } from '@/domain/money';
import type { InvoiceGroups } from '@/domain/portal';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { InvoiceView } from '@/server/invoices';
import { readPortal, type PortalContract } from './portal-data';
import { ApplicationRow, ContractRow } from './rows';

type PortalProps = { customerId: string; today: string; locale: Locale; t: Translate };

export async function CustomerPortal({ customerId, today, locale, t }: PortalProps) {
  const portal = await readPortal(customerId, today);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const day = (iso: string) => formatIsoDate(iso, locale);
  const { invoices } = portal;

  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-raised p-4 shadow-card sm:grid-cols-4">
        <Total label={t('portal.totals.active')} value={String(portal.activeCount)} />
        <Total label={t('portal.totals.openCount')} value={String(invoices.open.length)} />
        <Total label={t('portal.totals.openTotal')} value={money(invoices.openTotalCents)} />
        <Total
          label={t('portal.totals.nextDue')}
          value={invoices.nextDueDate ? day(invoices.nextDueDate) : t('portal.totals.nothingDue')}
        />
      </dl>

      <section aria-labelledby="portal-contracts">
        <h2 id="portal-contracts" className="mb-4 text-2xl">
          {t('leases.contracts')}
        </h2>
        {portal.contracts.length === 0 ? (
          <Notice tone="info">{t('leases.noContracts')}</Notice>
        ) : (
          <ul className="space-y-3">
            {portal.contracts.map((entry) => (
              <li key={entry.contract.id} className="space-y-2">
                <ContractRow
                  contract={entry.contract}
                  asset={portal.assetById.get(entry.contract.assetId)}
                  customer={null}
                  locale={locale}
                  t={t}
                />
                <ExitChoicesLine entry={entry} locale={locale} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {portal.unsigned.length > 0 ? (
        <section aria-labelledby="portal-applications">
          <h2 id="portal-applications" className="mb-4 text-2xl">
            {t('leases.applications')}
          </h2>
          <ul className="space-y-3">
            {portal.unsigned.map(({ application, asset }) => (
              <li key={application.id}>
                <ApplicationRow
                  application={application}
                  asset={asset}
                  customer={null}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <InvoiceSections invoices={invoices} numberOf={portal.numberOf} locale={locale} t={t} />
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** The ways out of an active contract today, each a link to the contract page's exit section. */
function ExitChoicesLine({
  entry,
  locale,
  t,
}: {
  entry: PortalContract;
  locale: Locale;
  t: Translate;
}) {
  const { choices, contract } = entry;
  if (choices.code === 'contract_ended') return null;
  if (choices.code === 'not_started') {
    return (
      <p className="px-3 text-sm text-ink-muted">
        {t('portal.exit.not_started', { date: formatIsoDate(choices.params.startDate, locale) })}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 text-sm">
      <span className="text-ink-muted">
        {t(`portal.exit.${choices.code}`, {
          date: formatIsoDate(choices.params.endDate, locale),
        })}
      </span>
      {choices.params.modes.map((mode) => (
        <Link
          key={mode}
          href={`/${locale}/contracts/${contract.id}#exit`}
          className="font-bold text-brand-text underline-offset-2 hover:underline"
        >
          {t(`exit.mode.${mode}`)}
        </Link>
      ))}
    </p>
  );
}

type InvoiceSectionsProps = {
  invoices: InvoiceGroups<InvoiceView>;
  numberOf: Map<string, string>;
  locale: Locale;
  t: Translate;
};

function InvoiceSections({ invoices, numberOf, locale, t }: InvoiceSectionsProps) {
  const overdue = new Set(invoices.overdue.map((i) => i.id));
  // What is owed reads soonest first; paid and cancelled keep the read's newest-first order.
  const soonestFirst = (items: InvoiceView[]) =>
    [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
  const list = (items: InvoiceView[], statusOf: (invoice: InvoiceView) => LineStatus) => (
    <ul className="divide-y divide-line">
      {items.map((invoice) => (
        <li key={invoice.id}>
          <InvoiceLine
            invoice={invoice}
            number={numberOf.get(invoice.contractId) ?? ''}
            status={statusOf(invoice)}
            locale={locale}
            t={t}
          />
        </li>
      ))}
    </ul>
  );
  const empty =
    invoices.open.length +
      invoices.upcoming.length +
      invoices.paid.length +
      invoices.cancelled.length ===
    0;

  return (
    <section aria-labelledby="portal-invoices" className="space-y-4">
      <h2 id="portal-invoices" className="text-2xl">
        {t('invoice.title')}
      </h2>
      {empty ? (
        <Notice tone="info">{t('portal.invoices.none')}</Notice>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-raised px-4 shadow-card">
            <h3 className="flex flex-wrap justify-between gap-x-4 pt-4 text-lg">
              <span>{t('portal.invoices.open')}</span>
              <span className="tabular-nums">
                {formatEuro(invoices.openTotalCents, intlLocale[locale])}
              </span>
            </h3>
            {invoices.open.length === 0 ? (
              <p className="py-4 text-sm text-ink-muted">{t('portal.invoices.noneOpen')}</p>
            ) : (
              list(soonestFirst(invoices.open), (i) => (overdue.has(i.id) ? 'overdue' : 'due'))
            )}
          </div>
          {invoices.upcoming.length > 0 ? (
            <Disclosure title={t('portal.invoices.upcoming', { count: invoices.upcoming.length })}>
              {list(soonestFirst(invoices.upcoming), () => 'upcoming')}
            </Disclosure>
          ) : null}
          {invoices.paid.length > 0 ? (
            <Disclosure title={t('portal.invoices.paid', { count: invoices.paid.length })}>
              {list(invoices.paid, () => 'paid')}
            </Disclosure>
          ) : null}
          {invoices.cancelled.length > 0 ? (
            <Disclosure
              title={t('portal.invoices.cancelled', { count: invoices.cancelled.length })}
            >
              {list(invoices.cancelled, () => 'cancelled')}
            </Disclosure>
          ) : null}
        </>
      )}
    </section>
  );
}

type LineStatus = 'due' | 'overdue' | 'upcoming' | 'paid' | 'cancelled';

function InvoiceLine({
  invoice,
  number,
  status,
  locale,
  t,
}: {
  invoice: InvoiceView;
  number: string;
  status: LineStatus;
  locale: Locale;
  t: Translate;
}) {
  const date =
    status === 'paid' && invoice.paidOn
      ? t('portal.invoices.paidOn', { date: formatIsoDate(invoice.paidOn, locale) })
      : t('portal.invoices.dueOn', { date: formatIsoDate(invoice.dueDate, locale) });
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <p className="font-bold">
          {t('portal.invoices.line', { number, kind: t(`invoice.kind.${invoice.kind}`) })}
        </p>
        <p className="text-sm text-ink-muted">{date}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">{formatEuro(invoice.grossCents, intlLocale[locale])}</span>
        <Badge status={status === 'upcoming' ? 'issued' : status}>
          {t(`invoice.status.${status}`)}
        </Badge>
        {status === 'due' || status === 'overdue' ? (
          <Link
            href={`/${locale}/contracts/${invoice.contractId}`}
            className="font-bold text-brand-text underline-offset-2 hover:underline"
          >
            {t('portal.invoices.pay')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
