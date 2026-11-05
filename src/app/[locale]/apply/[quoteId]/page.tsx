// The application for a quote: one question at a time (CHALLENGE.md spine 3, smart problem 4).
// The acting customer (the header's picker, D17) applies; the deal comes from the quote.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { QuestionFlow } from '@/components/question-flow';
import { Money, Notice, PageHeader, PriceTag } from '@/components/ui';
import { loadPriceLists, loadQuestions } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { whyWeAsk } from '@/domain/question-flow/engine';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { formatIsoDate } from '@/i18n/format';
import { intlLocale, isLocale } from '@/i18n/locales';
import { readActor } from '@/server/actor';
import { flowSetupFor } from '@/server/applications';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { getQuote, storedQuoteStatusOn } from '@/server/quotes';

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
  // The quote the price page stored when the customer pressed "Apply at this price" (D7).
  const [quote, today, priceLists] = await Promise.all([
    getQuote(db, quoteId),
    todayForRequest(),
    loadPriceLists(),
  ]);
  // Only a quote that is still valid shows "price locked until"; an expired one is refused
  // when the application is sent, so the page must not promise the price.
  const locked =
    quote && storedQuoteStatusOn(quote, today, priceLists).status === 'valid' ? quote : null;

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
      {locked ? (
        <PriceTag
          size="sm"
          className="mb-8 max-w-md"
          label={t('apply.locked', { date: formatIsoDate(locked.validUntil, locale) })}
          amount={<Money cents={locked.breakdown.monthlyGrossCents} locale={locale} />}
          sub={t('apply.lockedSub', {
            months: locked.breakdown.termMonths,
            version: locked.breakdown.priceListVersion,
            quoteDate: formatIsoDate(locked.quoteDate, locale),
          })}
        />
      ) : null}
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
        today={today}
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
          birthDateRange: raw('apply.birthDateRange'),
          signatoryIsApplicant: t('apply.signatoryIsApplicant'),
          pruned: raw('apply.pruned'),
          moneyHint: t('apply.moneyHint'),
          listHint: t('apply.listHint'),
          prefill: t('apply.prefill', { name: customer.name }),
        }}
      />
    </>
  );
}
