// The top of every page, in up to three layers:
// - the staff strip (teal), for the signed-in admin only (D93, D94): the demo page and the
//   "Act as" picker, while the demo tools are on;
// - the acting-as banner, while the admin acts as a customer, with the way back;
// - the customer header (paper): the brand, the catalogue, how it works, the language, and
//   sign in, or who is signed in and sign out (D91).
// A server component; the picker, the sign-out button, the nav and the language switcher are
// small clients.
import Link from 'next/link';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, ANONYMOUS_ACTOR } from '@/server/actor';
import { ActorPicker, StopActingButton } from './actor-picker';
import { LanguageSwitcher } from './language-switcher';
import { LoopMark } from './loop-mark';
import { SignOutButton } from './sign-out-button';
import { NavLinks, cx } from './ui';

type SiteHeaderProps = {
  locale: Locale;
  t: Translate;
  /** Who the request acts as. */
  actor: string;
  /** Who signed in (`admin` or a customer id), or null. */
  account: string | null;
  /** The customer the admin acts as, or null. */
  actingAs: string | null;
  /** True while the demo tools are on (D74). */
  demoTools: boolean;
  /** Every customer, for the admin's picker and for the names shown. */
  customers: readonly { id: string; name: string }[];
};

/** "Sign in", or who is signed in and "Sign out". */
function SessionControls({
  locale,
  t,
  account,
  accountName,
}: {
  locale: Locale;
  t: Translate;
  account: string | null;
  accountName: string;
}) {
  if (account === null) {
    return (
      <Link
        href={`/${locale}/login`}
        className="inline-flex min-h-9 items-center rounded-full border-2 border-brand px-4 text-sm font-bold text-brand-text hover:bg-brand-soft"
      >
        {t('nav.signIn')}
      </Link>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">{t('nav.signedInAs', { name: accountName })}</span>
      <SignOutButton home={`/${locale}`} label={t('nav.signOut')} error={t('nav.signOutError')} />
    </span>
  );
}

export function SiteHeader({
  locale,
  t,
  actor,
  account,
  actingAs,
  demoTools,
  customers,
}: SiteHeaderProps) {
  const isAdmin = actor === ADMIN_ACTOR;
  const nameOf = (id: string) => customers.find((customer) => customer.id === id)?.name ?? id;
  const accountName = account === ADMIN_ACTOR ? t('login.admin') : account ? nameOf(account) : '';
  const staff = account === ADMIN_ACTOR;
  const staffLinks = [
    // The audit log is reached from the demo page's "Audit log" section, not from here.
    { href: `/${locale}/demo`, label: t('nav.demo') },
  ];
  const mainLinks = [
    { href: `/${locale}/catalogue`, label: t('nav.catalogue') },
    { href: `/${locale}#how-it-works`, label: t('nav.howItWorks') },
    // Once someone is signed in: their leases (every lease for the admin).
    ...(actor === ANONYMOUS_ACTOR
      ? []
      : [{ href: `/${locale}/leases`, label: t(isAdmin ? 'nav.leasesAdmin' : 'nav.leases') }]),
  ];

  return (
    <>
      {staff ? (
        <div className="staff-zone bg-staff text-staff-contrast">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-bold tracking-wide uppercase opacity-80 max-sm:hidden">
                {t('staff.label')}
              </span>
              <nav aria-label={t('staff.nav')}>
                <ul className="flex flex-wrap gap-1">
                  {staffLinks.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="block rounded-full px-3 py-1 font-semibold underline-offset-4 hover:bg-staff-hover hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            {demoTools ? (
              <ActorPicker
                key={actingAs ?? ADMIN_ACTOR}
                customers={customers}
                actingAs={actingAs}
                labels={{
                  label: t('actor.label'),
                  admin: t('actor.admin'),
                  submit: t('actor.submit'),
                  error: t('actor.error'),
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {staff && actingAs ? (
        <div role="status" className="border-b-2 border-accent bg-accent-soft text-ink">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <p className="font-semibold">{t('actor.actingAs', { name: nameOf(actingAs) })}</p>
            <StopActingButton label={t('actor.stop')} error={t('actor.error')} />
          </div>
        </div>
      ) : null}

      <header className="rule-dashed border-b-2 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2.5 rounded-lg"
            aria-label={t('brand.home')}
          >
            <LoopMark className="size-9" />
            <span className="font-heading text-xl font-semibold tracking-tight">
              {t('brand.name')}
            </span>
          </Link>

          <div className="hidden items-center gap-4 md:flex">
            <NavLinks label={t('nav.main')} items={mainLinks} />
            <LanguageSwitcher current={locale} label={t('nav.language')} />
            <SessionControls locale={locale} t={t} account={account} accountName={accountName} />
          </div>

          {/* On a phone the links fold into a menu; <details> needs no JavaScript. */}
          <details data-nav-menu className="group relative md:hidden">
            <summary
              className={cx(
                'flex size-11 cursor-pointer list-none items-center justify-center rounded-full',
                'border-2 border-brand text-brand-text'
              )}
            >
              <span className="sr-only">{t('nav.menu')}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path className="group-open:hidden" d="M4 7h16M4 12h16M4 17h16" />
                <path className="hidden group-open:block" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 space-y-4 rounded-lg border border-line bg-raised p-4 shadow-lg">
              <NavLinks label={t('nav.main')} items={mainLinks} vertical />
              <LanguageSwitcher current={locale} label={t('nav.language')} />
              <SessionControls locale={locale} t={t} account={account} accountName={accountName} />
            </div>
          </details>
        </div>
      </header>
    </>
  );
}
