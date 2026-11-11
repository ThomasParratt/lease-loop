// The sign-in page (D91, D95): people (consumers, sole traders) identify with their bank; the
// admin and companies use their e-mail and password. The customer type is the record's (D92).
// After signing in the browser goes back to `?next=` when it is a page of this site in this
// language (safeNextPath), else to the catalogue. A failed bank identification comes back with
// `?identificationError=<code>`. Already signed in: who, and a way out.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { BankIdentifyButton } from '@/components/bank-identify-button';
import { SignInForm } from '@/components/sign-in-form';
import { SignOutButton } from '@/components/sign-out-button';
import { Card, Notice, PageHeader, buttonClasses } from '@/components/ui';
import { safeNextPath } from '@/domain/auth/redirect';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ADMIN_ACTOR, readSession } from '@/server/actor';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { testBankOn } from '@/server/test-bank';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/login'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('login.title') }) };
}

export default async function LoginPage({ params, searchParams }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // who is signed in is per request

  const t = getT(locale);
  const { next, identificationError } = await searchParams;
  const errorKey = `identification.error.${String(identificationError)}`;
  const identificationProblem =
    typeof identificationError === 'string'
      ? t(
          (errorKey in messages.en
            ? errorKey
            : 'identification.error.identification_failed') as MessageKey
        )
      : null;
  const target = safeNextPath(typeof next === 'string' ? next : undefined, locale);
  const session = await readSession(db);
  const name =
    session === null
      ? null
      : session.account === ADMIN_ACTOR
        ? t('login.admin')
        : ((await getCustomer(db, session.account))?.name ?? session.account);

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('login.title')} intro={name === null ? t('login.intro') : undefined} />
      {identificationProblem ? (
        <Notice tone="error" className="mb-6">
          {identificationProblem}
        </Notice>
      ) : null}
      {name === null ? (
        <Card title={t('login.bank.title')} className="mb-6">
          <p className="mb-4">{t('login.bank.intro')}</p>
          {testBankOn() ? (
            <BankIdentifyButton
              purpose="sign_in"
              locale={locale}
              next={target}
              labels={{
                button: t('login.bank.button'),
                pending: t('login.bank.pending'),
                error: t('login.bank.error'),
              }}
            />
          ) : (
            <Notice tone="info">{t('login.bank.off')}</Notice>
          )}
        </Card>
      ) : null}
      <Card title={name === null ? t('login.password.title') : undefined}>
        {name === null ? (
          <SignInForm
            next={target}
            labels={{
              email: t('login.email'),
              password: t('login.password'),
              submit: t('login.submit'),
              pending: t('login.pending'),
              invalid: t('login.invalid'),
              rateLimited: t('login.rateLimited'),
              error: t('login.error'),
            }}
          />
        ) : (
          <div className="space-y-4">
            <Notice tone="success">{t('login.signedIn', { name })}</Notice>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={target} className={buttonClasses('primary', 'md')}>
                {t('login.continue')}
              </Link>
              <SignOutButton
                home={`/${locale}`}
                label={t('nav.signOut')}
                error={t('nav.signOutError')}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
