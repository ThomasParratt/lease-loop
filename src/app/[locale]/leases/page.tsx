// My leases: the acting customer's contracts (each opening its page, where the invoices are
// and the lease is ended), then their applications that are not signed yet (an approved one
// leads to its Sign button). Admin sees every contract and application, with the customer's
// name, so the demo reaches any contract in two clicks. Nobody chosen: a pointer to "Continue
// as". Read-only; every read goes through its table owner's function (team rule 3).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { ItemArt } from '@/components/item-art';
import { Badge, Notice, PageHeader } from '@/components/ui';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, ANONYMOUS_ACTOR, readActor } from '@/server/actor';
import { listApplications, type ApplicationView } from '@/server/applications';
import { listAssets } from '@/server/assets';
import { listContracts, type ContractView } from '@/server/contracts';
import { listCustomers } from '@/server/customers';
import { db } from '@/server/db';
import { getQuote } from '@/server/quotes';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/leases'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('nav.leases') }) };
}

export default async function LeasesPage({ params }: PageProps<'/[locale]/leases'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // the lists change with every signing

  const t = getT(locale);
  const actor = await readActor(db);
  const isAdmin = actor === ADMIN_ACTOR;
  const title = t(isAdmin ? 'nav.leasesAdmin' : 'nav.leases');

  if (actor === ANONYMOUS_ACTOR) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={title} />
        <Notice tone="info">{t('leases.chooseActor')}</Notice>
      </div>
    );
  }

  const filter = isAdmin ? {} : { customerId: actor };
  const [contracts, applications, assets, customers] = await Promise.all([
    listContracts(db, filter),
    listApplications(db, filter),
    listAssets(db),
    isAdmin ? listCustomers(db) : Promise.resolve([]),
  ]);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? id;

  // An application that became a contract is listed as the contract only.
  const signed = new Set(contracts.map((c) => c.applicationId));
  const unsigned = await Promise.all(
    applications
      .filter((a) => !signed.has(a.id))
      .map(async (application) => {
        const quote = await getQuote(db, application.quoteId);
        return { application, asset: quote ? assetById.get(quote.breakdown.assetId) : undefined };
      })
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={title} intro={t(isAdmin ? 'leases.introAdmin' : 'leases.intro')} />

      <section aria-labelledby="leases-contracts">
        <h2 id="leases-contracts" className="mb-4 text-2xl">
          {t('leases.contracts')}
        </h2>
        {contracts.length === 0 ? (
          <Notice tone="info">{t('leases.noContracts')}</Notice>
        ) : (
          <ul className="space-y-3">
            {contracts.map((contract) => (
              <li key={contract.id}>
                <ContractRow
                  contract={contract}
                  asset={assetById.get(contract.assetId)}
                  customer={isAdmin ? nameOf(contract.customerId) : null}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {unsigned.length > 0 ? (
        <section aria-labelledby="leases-applications" className="mt-10">
          <h2 id="leases-applications" className="mb-4 text-2xl">
            {t('leases.applications')}
          </h2>
          <ul className="space-y-3">
            {unsigned.map(({ application, asset }) => (
              <li key={application.id}>
                <ApplicationRow
                  application={application}
                  asset={asset}
                  customer={isAdmin ? nameOf(application.customerId) : null}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type RowProps = { asset: Asset | undefined; customer: string | null; locale: Locale; t: Translate };

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

function ContractRow({
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

function ApplicationRow({
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
