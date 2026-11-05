// The audit page: the hash chain's state, then the newest 50 audit rows, newest first, as a table.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AuditChainBadge } from '@/components/audit-chain-badge';
import { Card, Notice, PageHeader } from '@/components/ui';
import { formatTimestamp } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAuditLog, verifyAuditChain } from '@/server/audit';
import { db } from '@/server/db';

const LIMIT = 50;

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/audit'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('audit.title') }) };
}

export default async function AuditPage({ params }: PageProps<'/[locale]/audit'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [rows, verdict] = await Promise.all([listAuditLog(db, LIMIT), verifyAuditChain(db)]);
  const headers = [
    t('audit.col.when'),
    t('audit.col.actor'),
    t('audit.col.action'),
    t('audit.col.entity'),
    t('audit.col.details'),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('audit.title')} intro={t('audit.intro')} />
      <AuditChainBadge verdict={verdict} t={t} />

      {rows.length === 0 ? (
        <Notice tone="info">{t('audit.empty')}</Notice>
      ) : (
        <Card padded={false}>
          {/* The table scrolls sideways on a phone instead of squeezing the details. */}
          <div className="overflow-x-auto" tabIndex={0} aria-labelledby="audit-caption">
            <table className="w-full text-left text-sm">
              <caption id="audit-caption" className="px-5 pt-4 pb-2 text-left text-ink-muted">
                {t('audit.caption', { count: LIMIT })}
              </caption>
              <thead className="border-b border-line">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-5 py-3 font-semibold whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                      <time dateTime={row.created_at}>
                        {formatTimestamp(row.created_at, locale)}
                      </time>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{row.actor}</td>
                    <td className="px-5 py-3 font-mono text-xs">{row.action}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {row.entity_type} <span className="font-mono text-xs">{row.entity_id}</span>
                    </td>
                    <td className="min-w-64 px-5 py-3">
                      {row.details === null ? (
                        <span className="text-ink-muted">{t('audit.noDetails')}</span>
                      ) : (
                        <code className="font-mono text-xs break-all">
                          {JSON.stringify(row.details)}
                        </code>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
