// The decision on an application: a clear yes, no or "a person will check", and every reason
// written from its code in the visitor's language (team rule 6). An admin decides a manual
// review here, the named signatory signs an awaiting_signatory case (D10), and the applicant
// signs an approved one into a contract (issue 39), or follows the link to the contract.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SignContractForm } from '@/components/sign-contract-form';
import { Card, LinkButton, Notice, PageHeader } from '@/components/ui';
import { loadQuestions } from '@/data/load';
import { addDays } from '@/domain/civil-days';
import { START_DAYS_MAX } from '@/domain/contracts';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { getApplication, type StoredReason } from '@/server/applications';
import { contractIdOfApplication } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
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
  // Read once here and passed down (team rule 4); the server signs on its own today anyway.
  const today = await todayForRequest();
  const contractId = decision === 'approved' ? await contractIdOfApplication(db, id) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('decision.title')} />
      {/* The outcome is the page's first heading under the h1; it is there on load, so it
          is not announced as a live region. */}
      <div
        className={`mb-8 flex items-center gap-5 rounded-xl border-2 p-6 ${PANEL[TONE[decision]]}`}
      >
        <span
          aria-hidden="true"
          className={`grid size-14 shrink-0 place-items-center rounded-full font-heading text-3xl font-semibold ${ICON[TONE[decision]]}`}
        >
          {GLYPH[TONE[decision]]}
        </span>
        <div>
          <h2 className="font-heading text-2xl leading-tight font-semibold sm:text-3xl">
            {t(`decision.status.${decision}`)}
          </h2>
          <p className="mt-1">
            {t('decision.decidedOn', { date: formatIsoDate(application.decidedOn, locale) })}
          </p>
        </div>
      </div>

      {/* A yes needs no reasons ("every check passed" says nothing new); a no, a manual
          review or a wait for the signatory does, without a badge repeating the panel. */}
      {decision === 'approved' ? null : (
        <Card as="section" title={t('decision.reasons')} titleId="decision-reasons">
          <ul className="list-disc space-y-2 pl-5">
            {application.reasons.map((reason, index) => (
              <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>
            ))}
          </ul>
        </Card>
      )}

      {decision === 'approved' ? (
        <Card as="section" title={t('contract.sign.title')} titleId="contract-sign">
          {contractId ? (
            <div className="space-y-4">
              <p>{t('contract.sign.done')}</p>
              <LinkButton href={`/${locale}/contracts/${contractId}`}>
                {t('contract.sign.open')}
              </LinkButton>
            </div>
          ) : actor === application.customerId || actor === ADMIN_ACTOR ? (
            <div className="space-y-4">
              <p>{t('contract.sign.intro')}</p>
              <SignContractForm
                applicationId={application.id}
                locale={locale}
                today={today}
                latestStartDate={addDays(today, START_DAYS_MAX)}
                maxDays={START_DAYS_MAX}
              />
            </div>
          ) : (
            <Notice tone="info">{t('contract.sign.applicantOnly')}</Notice>
          )}
        </Card>
      ) : null}

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

      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href={`/${locale}`}>
          <span aria-hidden="true">←</span> {t('decision.home')}
        </LinkButton>
        <LinkButton href={`/${locale}/catalogue`} variant="secondary">
          {t('decision.catalogue')}
        </LinkButton>
      </div>
    </div>
  );
}
