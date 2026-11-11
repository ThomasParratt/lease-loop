// The Test Bank (D97): the mock broker's page, where a person "identifies". It says plainly
// that it is test identification, looks like Lease Loop and like no real bank, and exists only
// while the demo tools are on. It takes the request's state and nonce from the address and
// hands them back with the chosen person's code; it never sees our database's requests.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Card, Notice, PageHeader } from '@/components/ui';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listCustomers } from '@/server/customers';
import { db } from '@/server/db';
import { testBankOn, testPeople } from '@/server/test-bank';
import { TestBankChoices } from './test-bank-choices';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/test-bank'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getT(locale)('testBank.title'), robots: { index: false } };
}

export default async function TestBankPage({
  params,
  searchParams,
}: PageProps<'/[locale]/test-bank'>) {
  const { locale } = await params;
  if (!isLocale(locale) || !testBankOn()) notFound();
  await connection();
  const t = getT(locale);
  const { state, nonce } = await searchParams;
  const complete =
    typeof state === 'string' && state !== '' && typeof nonce === 'string' && nonce !== '';
  const people = testPeople(await listCustomers(db)).map((person) => ({
    customerId: person.customerId,
    name: person.name,
    born: t('testBank.born', { date: formatIsoDate(person.birthDate, locale) }),
    code: t('testBank.code', { code: person.personalCode }),
  }));

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('testBank.title')} intro={complete ? t('testBank.intro') : undefined} />
      <Notice tone="warning" title={t('testBank.warning')} className="mb-6" />
      <Card>
        {complete ? (
          <TestBankChoices
            state={state}
            nonce={nonce}
            people={people}
            labels={{
              choose: t('testBank.choose'),
              cancel: t('testBank.cancel'),
              error: t('testBank.error'),
            }}
          />
        ) : (
          <Notice tone="info">{t('testBank.missing')}</Notice>
        )}
      </Card>
    </div>
  );
}
