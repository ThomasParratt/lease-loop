// The decision on an application: a clear yes, no or "a person will check", and every reason
// written from its code in the visitor's language (team rule 6). An admin decides a manual
// review here, and the named signatory signs an awaiting_signatory case (D10).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { loadQuestions } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { getApplication, type StoredReason } from '@/server/applications';
import { db } from '@/server/db';
import { DecisionForm } from './decision-form';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/applications/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('decision.title') }) };
}

/**
 * Params that are days or cents are written for the reader, a question id as the question's
 * text (`questionText`); the rest as they are.
 */
function formatParams(
  params: StoredReason['params'],
  locale: Locale,
  questionText: Record<string, string>
) {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => {
      if (name === 'question' && typeof value === 'string') {
        return [name, questionText[value] ?? value];
      }
      if (typeof value === 'number' && name.endsWith('Cents')) {
        return [name, formatEuro(value, intlLocale[locale])];
      }
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return [name, formatIsoDate(value, locale)];
      }
      return [name, value];
    })
  );
}

const TONE = {
  approved: 'success',
  rejected: 'error',
  manual_review: 'warning',
  awaiting_signatory: 'warning',
} as const;

// The decision panel: one colour, one glyph per outcome. The glyph is decoration; the
// sentence beside it says the same in words.
const PANEL = {
  success: 'border-success-line bg-success-soft text-success-ink',
  warning: 'border-warning-line bg-warning-soft text-warning-ink',
  error: 'border-danger-line bg-danger-soft text-danger-ink',
} as const;
const ICON = {
  success: 'bg-success-solid text-raised',
  warning: 'bg-warning-solid text-raised',
  error: 'bg-danger-solid text-raised',
} as const;
const GLYPH = { success: '✓', warning: '…', error: '!' } as const;

export default async function ApplicationPage({
  params,
}: PageProps<'/[locale]/applications/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);

  const application = await getApplication(db, id);
  if (!application) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={t('decision.title')} />
        <Notice tone="warning">{t('decision.notFound')}</Notice>
      </div>
    );
  }
  const actor = await readActor(db);
  const questionText = Object.fromEntries(
    (await loadQuestions()).questions.map((q) => [q.id, q.text[locale]])
  );
  const dictionary: Record<string, string> = messages[locale];
  const reasonText = (reason: StoredReason) => {
    const key = `decision.reason.${reason.code}`;
    return key in dictionary
      ? t(key as MessageKey, formatParams(reason.params, locale, questionText))
      : t('decision.reason.unknown', { code: reason.code });
  };
  const { decision } = application;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('decision.title')} />
      <div
        role="status"
        className={`mb-8 flex items-center gap-5 rounded-xl border-2 p-6 ${PANEL[TONE[decision]]}`}
      >
        <span
          aria-hidden="true"
          className={`grid size-14 shrink-0 place-items-center rounded-full font-heading text-3xl font-semibold ${ICON[TONE[decision]]}`}
        >
          {GLYPH[TONE[decision]]}
        </span>
        <div>
          <p className="font-heading text-2xl leading-tight font-semibold sm:text-3xl">
            {t(`decision.status.${decision}`)}
          </p>
          <p className="mt-1">
            {t('decision.decidedOn', { date: formatIsoDate(application.decidedOn, locale) })}
          </p>
        </div>
      </div>

      <Card as="section" title={t('decision.reasons')} titleId="decision-reasons">
        <div className="mb-4">
          <Badge status={decision}>{t(`decision.badge.${decision}`)}</Badge>
        </div>
        <ul className="list-disc space-y-2 pl-5">
          {application.reasons.map((reason, index) => (
            <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>
          ))}
        </ul>
      </Card>

      {decision === 'manual_review' ? (
        <Card
          as="section"
          title={t('decision.review.title')}
          titleId="decision-review"
          className="mt-6"
        >
          {actor === ADMIN_ACTOR ? (
            <DecisionForm
              applicationId={application.id}
              reviewer={ADMIN_ACTOR}
              labels={{
                approve: t('decision.approve'),
                reject: t('decision.reject'),
                error: t('decision.error'),
              }}
            />
          ) : (
            <Notice tone="info">{t('decision.review.adminOnly')}</Notice>
          )}
        </Card>
      ) : null}

      {decision === 'awaiting_signatory' ? (
        <Card
          as="section"
          title={t('decision.sign.title')}
          titleId="decision-sign"
          className="mt-6"
        >
          {actor === application.customerId ? (
            <DecisionForm
              applicationId={application.id}
              reviewer={String(application.answers.q_signatory_email ?? '')}
              askWho={t('decision.sign.who')}
              labels={{
                approve: t('decision.sign'),
                reject: t('decision.decline'),
                error: t('decision.error'),
                forbidden: t('decision.sign.notSignatory'),
              }}
            />
          ) : (
            <Notice tone="info">{t('decision.sign.companyOnly')}</Notice>
          )}
        </Card>
      ) : null}
    </div>
  );
}
