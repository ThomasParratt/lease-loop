// The sign-in page (D91): e-mail and password; the customer type is the record's (D92). After
// signing in the browser goes back to `?next=` when it is a page of this site in this language
// (safeNextPath), else to the catalogue. Already signed in: who, and a way out.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SignInForm } from '@/components/sign-in-form';
import { SignOutButton } from '@/components/sign-out-button';
import { Card, Notice, PageHeader, buttonClasses } from '@/components/ui';
import { safeNextPath } from '@/domain/auth/redirect';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ADMIN_ACTOR, readSession } from '@/server/actor';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';

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
  const { next } = await searchParams;
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
      <Card>
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
