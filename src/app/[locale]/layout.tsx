// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NavLinks } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import '../globals.css';

// The design tokens' fonts (D21). next/font downloads them at build time and serves them from
// this app, so the browser makes no third-party request; globals.css falls back to system-ui.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-jakarta',
  display: 'swap',
});

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);

  return (
    <html lang={locale} className={`${inter.variable} ${jakarta.variable}`}>
      <body className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-raised focus:px-4 focus:py-2 focus:text-ink focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <header className="border-b border-line bg-raised">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
            <Link href={`/${locale}`} className="flex items-center gap-3 rounded-lg">
              <LoopMark />
              <span>
                <span className="block font-heading text-lg font-bold tracking-tight">
                  {t('brand.name')}
                </span>
                <span className="block text-sm text-ink-muted">{t('brand.tagline')}</span>
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <NavLinks
                label={t('nav.main')}
                items={[
                  { href: `/${locale}`, label: t('nav.catalogue') },
                  { href: `/${locale}/demo`, label: t('nav.demo') },
                  { href: `/${locale}/audit`, label: t('nav.audit') },
                ]}
              />
              {/*
                The actor slot: wave 0a's <ActorPicker /> (src/components/actor-picker.tsx, the
                "continue as" picker over customers.json) is mounted here, between the nav and
                the language switcher, when it lands.
              */}
              <LanguageSwitcher current={locale} label={t('nav.language')} />
            </div>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-muted sm:px-6">
            {t('footer.skeleton')}
          </div>
        </footer>
      </body>
    </html>
  );
}

/** Two arrows chasing each other: lease, return, lease again. */
function LoopMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-9 shrink-0 rounded-xl bg-brand p-1.5 text-brand-contrast"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13a9 9 0 0 1 15.5-4.5L26 11" />
      <path d="M26 5v6h-6" />
      <path d="M24 19a9 9 0 0 1-15.5 4.5L6 21" />
      <path d="M6 27v-6h6" />
    </svg>
  );
}
