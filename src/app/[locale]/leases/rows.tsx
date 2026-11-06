// The rows of the leases page and the customer portal: one contract or one application, the
// item's drawing and name, the facts, and the whole row as one link (moved from page.tsx, D75).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ItemArt } from '@/components/item-art';
import { Badge } from '@/components/ui';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ApplicationView } from '@/server/applications';
import type { ContractView } from '@/server/contracts';

export type RowProps = {
  asset: Asset | undefined;
  customer: string | null;
  locale: Locale;
  t: Translate;
};

/** One row: the item's drawing and name, the facts, and the whole row as one link. */
function Row({
  href,
  linkLabel,
  asset,
  badge,
  facts,
}: {
  href: string;
  linkLabel: string;
  asset: Asset | undefined;
  badge: ReactNode;
  facts: string[];
}) {
  return (
    <article className="relative flex items-center gap-4 rounded-xl border border-line bg-raised p-3 shadow-card transition-colors hover:border-brand sm:gap-5">
      <div className="hidden w-28 shrink-0 rounded-lg bg-muted px-3 pt-3 pb-1 sm:block">
        {asset ? <ItemArt category={asset.category} model={asset.model} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-lg">
            <Link
              href={href}
              className="rounded after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {asset ? `${asset.make} ${asset.model}` : '—'}
            </Link>
          </h3>
          {badge}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{facts.join(' · ')}</p>
      </div>
      <span
        aria-hidden="true"
        className="hidden shrink-0 pr-2 text-sm font-bold text-brand-text sm:block"
      >
        {linkLabel} →
      </span>
    </article>
  );
}

export function ContractRow({
  contract,
  asset,
  customer,
  locale,
  t,
}: RowProps & { contract: ContractView }) {
  const day = (iso: string) => formatIsoDate(iso, locale);
  return (
    <Row
      href={`/${locale}/contracts/${contract.id}`}
      linkLabel={t('leases.open')}
      asset={asset}
      badge={<Badge status={contract.status}>{t(`contract.status.${contract.status}`)}</Badge>}
      facts={[
        t('leases.number', { number: contract.number }),
        t('leases.period', { start: day(contract.startDate), end: day(contract.endDate) }),
        t('leases.monthly', {
          amount: formatEuro(contract.monthlyNetCents, intlLocale[locale]),
        }),
        ...(customer ? [t('leases.customer', { name: customer })] : []),
      ]}
    />
  );
}

export function ApplicationRow({
  application,
  asset,
  customer,
  locale,
  t,
}: RowProps & { application: ApplicationView }) {
  const ready = application.decision === 'approved';
  return (
    <Row
      href={`/${locale}/applications/${application.id}`}
      linkLabel={ready ? t('leases.readyToSign') : t('leases.openApplication')}
      asset={asset}
      badge={
        <Badge status={application.decision}>{t(`leases.decision.${application.decision}`)}</Badge>
      }
      facts={[
        t('leases.applied', { date: formatIsoDate(application.decidedOn, locale) }),
        ...(customer ? [t('leases.customer', { name: customer })] : []),
      ]}
    />
  );
}
