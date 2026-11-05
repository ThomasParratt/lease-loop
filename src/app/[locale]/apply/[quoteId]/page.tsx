// The application for a quote: one question at a time (CHALLENGE.md spine 3, smart problem 4).
// The acting customer (the header's picker, D17) applies; the deal comes from the quote.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { QuestionFlow } from '@/components/question-flow';
import { Notice, PageHeader } from '@/components/ui';
import { loadQuestions } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { whyWeAsk } from '@/domain/question-flow/engine';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { readActor } from '@/server/actor';
import { flowSetupFor } from '@/server/applications';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/apply/[quoteId]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('apply.title') }) };
}

export default async function ApplyPage({ params }: PageProps<'/[locale]/apply/[quoteId]'>) {
  const { locale, quoteId } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);

  const actor = await readActor(db);
  const customer = await getCustomer(db, actor);
  const header = <PageHeader title={t('apply.title')} intro={t('apply.intro')} />;
  const page = (body: React.ReactNode) => (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      {header}
      {body}
    </div>
  );

  if (!customer) return page(<Notice tone="warning">{t('apply.chooseActor')}</Notice>);
  const found = await flowSetupFor(db, quoteId, customer.id);
  if (!found.ok) return page(<Notice tone="warning">{t('apply.quoteNotFound')}</Notice>);
  const { context } = found.setup;

  const bank = (await loadQuestions()).questions;
  const dictionary: Record<string, string> = messages[locale];
  const texts = Object.fromEntries(
    bank.map((q) => [
      q.id,
      { text: q.text[locale], why: dictionary[`question.why.${q.id}`] ?? whyWeAsk(q, locale) },
    ])
  );
  const options = Object.fromEntries(
    bank.flatMap((q) => q.options ?? []).map((o) => [o, dictionary[`question.option.${o}`] ?? o])
  );
  const raw = (key: MessageKey) => messages[locale][key];

  return page(
    <>
      <p className="mb-6 text-ink-muted">
        {t('apply.deal', {
          months: context.termMonths,
          amount: formatEuro(context.financedCents, intlLocale[locale]),
        })}
      </p>
      <QuestionFlow
        locale={locale}
        quoteId={quoteId}
        customerId={customer.id}
        bank={bank}
        context={context}
        texts={texts}
        options={options}
        prefill={answersFromCustomer(customer)}
        labels={{
          progress: raw('apply.progress'),
          why: t('apply.why'),
          next: t('apply.next'),
          back: t('apply.back'),
          change: t('apply.change'),
          review: t('apply.review'),
          submit: t('apply.submit'),
          sending: t('apply.sending'),
          error: t('apply.error'),
          required: t('apply.required'),
          invalid: t('apply.invalid'),
          pruned: raw('apply.pruned'),
          moneyHint: t('apply.moneyHint'),
          listHint: t('apply.listHint'),
          prefill: t('apply.prefill', { name: customer.name }),
        }}
      />
    </>
  );
}
