// "How it works": the two things a customer most needs explained. First, the end of the term
// (buy, return or pass on), drawn as the fork it is. Second, what "the price is locked" means
// when VAT changes. Both are rules the app actually follows (D2, D16).
import type { Translate } from '@/i18n/get-t';

export function HowItWorks({ t }: { t: Translate }) {
  const choices = ['buy', 'return', 'passOn'] as const;
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-6 bg-muted">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <EndOfTermFork t={t} />
        <div>
          <h2 id="how-title" className="text-4xl">
            {t('how.title')}
          </h2>
          <p className="mt-3 text-lg text-ink-muted">{t('how.intro')}</p>
          <ol className="mt-6 space-y-5">
            {choices.map((choice, index) => (
              <li key={choice} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-brand font-heading font-semibold text-brand-contrast"
                >
                  {index + 1}
                </span>
                <span>
                  <span className="block font-heading text-xl font-semibold">
                    {t(`how.${choice}.title`)}
                  </span>
                  <span className="block text-ink-muted">{t(`how.${choice}.body`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-lg border-2 border-dashed border-line-strong p-5">
            <p className="font-heading text-lg font-semibold">{t('how.vat.title')}</p>
            <p className="mt-1 text-ink-muted">{t('how.vat.body')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The lease as a line that forks into the three choices at the end of the term. */
function EndOfTermFork({ t }: { t: Translate }) {
  const ends = [
    { y: 40, key: 'buy' },
    { y: 110, key: 'return' },
    { y: 180, key: 'passOn' },
  ] as const;
  return (
    <svg
      viewBox="0 0 500 220"
      className="w-full"
      role="img"
      aria-label={t('how.diagram')}
      fill="none"
      strokeLinecap="round"
    >
      <circle cx="24" cy="110" r="10" stroke="var(--brand)" strokeWidth="4" fill="var(--raised)" />
      <path d="M34 110 H170" stroke="var(--brand)" strokeWidth="6" />
      <circle cx="180" cy="110" r="11" fill="var(--brand)" />
      <text x="24" y="86" fill="var(--ink)" fontWeight="700" fontSize="15">
        {t('how.diagramLease')}
      </text>
      <text
        x="180"
        y="146"
        textAnchor="middle"
        fill="var(--brand-text)"
        fontWeight="700"
        fontSize="15"
      >
        {t('how.diagramEnd')}
      </text>
      {ends.map((end, index) => (
        <g key={end.key}>
          <path
            d={`M191 110 C 240 110, 240 ${end.y}, 290 ${end.y}`}
            stroke="var(--brand)"
            strokeWidth="3"
            strokeDasharray="2 7"
          />
          <circle cx="304" cy={end.y} r="14" fill="var(--brand)" />
          <text
            x="304"
            y={end.y + 5}
            textAnchor="middle"
            fill="var(--brand-contrast)"
            fontWeight="800"
            fontSize="14"
          >
            {index + 1}
          </text>
          <text x="326" y={end.y + 5} fill="var(--ink)" fontWeight="800" fontSize="16">
            {t(`how.${end.key}.title`)}
          </text>
        </g>
      ))}
    </svg>
  );
}
