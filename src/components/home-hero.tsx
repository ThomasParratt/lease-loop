// The first screen: who we are in one line, the two ways in, and the loop in four steps.
// Only promises the app keeps: no shops, no delivery, no PDFs.
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { LinkButton } from './ui';

/** A character no translation contains, used to find where the green word goes. */
const MARK = '\u0000';

export function HomeHero({ locale, t }: { locale: Locale; t: Translate }) {
  const steps = [1, 2, 3, 4] as const;
  // "A {accent} way to own things." / "{accent} tapa omistaa.": the word order is the
  // translation's, so the title is one message and the green word is cut out of it.
  const [before = '', after = ''] = t('home.title', { accent: MARK }).split(MARK);
  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pt-12 pb-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20"
    >
      <div>
        <h1
          id="hero-title"
          className="text-5xl leading-[1.02] text-balance sm:text-6xl lg:text-7xl"
        >
          {before}
          <span className="text-brand-text">{t('home.titleAccent')}</span>
          {after}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-muted sm:text-xl">{t('home.intro')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href={`/${locale}/catalogue`} size="lg">
            {t('home.cta.catalogue')} <span aria-hidden="true">→</span>
          </LinkButton>
          <LinkButton href={`/${locale}#how-it-works`} size="lg" variant="secondary">
            {t('home.cta.how')}
          </LinkButton>
        </div>
      </div>

      <div className="rounded-xl bg-raised p-6 shadow-panel sm:p-8">
        <h2 className="text-sm font-extrabold tracking-[0.14em] text-ink-muted uppercase">
          {t('home.steps.title')}
        </h2>
        <ol className="mt-5">
          {steps.map((n) => (
            <li key={n} className="relative flex gap-4 pb-6 last:pb-0">
              {n < steps.length ? (
                <span
                  aria-hidden="true"
                  className="absolute top-11 bottom-1 left-[1.3rem] border-l-2 border-dotted border-line-strong"
                />
              ) : null}
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-brand font-heading text-xl font-semibold text-brand-contrast"
              >
                {n}
              </span>
              <span>
                <span className="block font-heading text-xl font-semibold">
                  {t(`home.steps.${n}.title`)}
                </span>
                <span className="block text-ink-muted">{t(`home.steps.${n}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
