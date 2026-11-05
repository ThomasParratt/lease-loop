'use client';

// The price sliders: term, down payment and quantity. Each change asks GET /api/quotes/preview
// (debounced, the previous request aborted) and shows the breakdown and the term comparison the
// server priced; the browser never computes a price. "Get a quote" posts to /api/quotes and
// opens the stored quote on this page.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { QuoteBreakdown, QuoteRefusal, TermComparison } from '@/domain/pricing';
import { getT } from '@/i18n/get-t';
import { formatEuro } from '@/domain/money';
import { intlLocale, type Locale } from '@/i18n/locales';
import { QuoteBreakdownList, refusalText } from './quote-breakdown';
import { Button, Card, Field, Money, Notice, inputClasses } from './ui';

export type QuotePreviewData = {
  today: string;
  quote: QuoteBreakdown | null;
  refusal: QuoteRefusal | null;
  comparison: TermComparison;
};

type QuoteCalculatorProps = {
  assetId: string;
  locale: Locale;
  terms: number[];
  /** Today's net list price of one unit, for the down-payment slider's range. */
  unitPriceCents: number;
  initial: { termMonths: number; downPaymentCents: number; quantity: number };
  initialPreview: QuotePreviewData;
  /** False when the asset is reserved or returned: the price shows, the button does not. */
  canQuote: boolean;
};

const DEBOUNCE_MS = 200;
const MAX_QUANTITY = 20;

/** The down payment moves in steps of 1 % of the price, rounded to whole euros. */
function downPaymentStep(totalCents: number): number {
  return Math.max(100, Math.round(totalCents / 100 / 100) * 100);
}

export function QuoteCalculator(props: QuoteCalculatorProps) {
  const { assetId, locale, terms, unitPriceCents, initialPreview, canQuote } = props;
  const t = getT(locale);
  const router = useRouter();
  const ids = useId();
  const [termIndex, setTermIndex] = useState(Math.max(0, terms.indexOf(props.initial.termMonths)));
  const [downPaymentCents, setDownPaymentCents] = useState(props.initial.downPaymentCents);
  const [quantity, setQuantity] = useState(props.initial.quantity);
  const [preview, setPreview] = useState(initialPreview);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRun = useRef(true);

  const termMonths = terms[termIndex] ?? terms[0]!;
  const totalPriceCents = unitPriceCents * quantity;
  const step = downPaymentStep(totalPriceCents);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({
        assetId,
        quantity: String(quantity),
        termMonths: String(termMonths),
        downPaymentCents: String(downPaymentCents),
      });
      try {
        const response = await fetch(`/api/quotes/preview?${query}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error('preview failed');
        setPreview(body.data as QuotePreviewData);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [assetId, quantity, termMonths, downPaymentCents]);

  function onQuantity(value: string) {
    const next = Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(Number(value)) || 1));
    setQuantity(next);
    setDownPaymentCents((down) => Math.min(down, unitPriceCents * next));
  }

  function getQuote() {
    setSubmitError(null);
    startTransition(async () => {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId, quantity, termMonths, downPaymentCents }),
      }).catch(() => null);
      const body = await response?.json().catch(() => null);
      if (response?.ok && body?.success) {
        router.push(`/${locale}/assets/${assetId}?quote=${body.data.id}#quote`);
        router.refresh();
        return;
      }
      const reason = body?.error?.details;
      setSubmitError(
        reason?.code ? refusalText(t, reason, locale) : t('pricing.calculator.submitFailed')
      );
    });
  }

  const quote = preview.quote;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card as="section" title={t('pricing.calculator.title')} titleId={`${ids}-title`}>
        <div className="space-y-6">
          <Field id={`${ids}-term`} label={t('pricing.calculator.term')}>
            {(control) => (
              <div>
                <p className="mb-2 text-2xl font-semibold tabular-nums" aria-hidden="true">
                  {t('pricing.months', { months: termMonths })}
                </p>
                <input
                  {...control}
                  type="range"
                  min={0}
                  max={terms.length - 1}
                  step={1}
                  value={termIndex}
                  aria-valuetext={t('pricing.months', { months: termMonths })}
                  onChange={(e) => setTermIndex(Number(e.target.value))}
                  className="h-11 w-full accent-brand"
                />
                <div className="flex justify-between text-xs text-ink-muted" aria-hidden="true">
                  {terms.map((term) => (
                    <span key={term}>{term}</span>
                  ))}
                </div>
              </div>
            )}
          </Field>

          <Field
            id={`${ids}-down`}
            label={t('pricing.calculator.downPayment')}
            hint={t('pricing.calculator.downPaymentHint')}
          >
            {(control) => (
              <div>
                <p className="mb-2 text-2xl font-semibold" aria-hidden="true">
                  <Money cents={downPaymentCents} locale={locale} />
                </p>
                <input
                  {...control}
                  type="range"
                  min={0}
                  max={totalPriceCents}
                  step={step}
                  value={downPaymentCents}
                  aria-valuetext={formatEuro(downPaymentCents, intlLocale[locale])}
                  onChange={(e) => setDownPaymentCents(Number(e.target.value))}
                  className="h-11 w-full accent-brand"
                />
              </div>
            )}
          </Field>

          <Field
            id={`${ids}-quantity`}
            label={t('pricing.calculator.quantity')}
            hint={t('pricing.calculator.quantityHint')}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                onChange={(e) => onQuantity(e.target.value)}
                className={`${inputClasses} max-w-32`}
              />
            )}
          </Field>

          <div aria-live="polite" className="rounded-lg bg-muted p-4">
            <p className="text-sm text-ink-muted">{t('pricing.calculator.youPay')}</p>
            <p className="text-3xl font-bold">
              {quote ? <Money cents={quote.monthlyGrossCents} locale={locale} /> : '–'}
            </p>
            <p className="text-sm text-ink-muted">
              {loading ? t('pricing.calculator.updating') : t('pricing.calculator.inclVat')}
            </p>
          </div>

          {failed ? <Notice tone="error">{t('pricing.calculator.previewFailed')}</Notice> : null}
          {preview.refusal ? (
            <Notice tone="warning" live>
              {refusalText(t, preview.refusal, locale)}
            </Notice>
          ) : null}

          {canQuote ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={getQuote}
              disabled={!quote || loading}
              pending={pending}
              pendingLabel={t('pricing.calculator.saving')}
            >
              {t('pricing.calculator.getQuote')}
            </Button>
          ) : (
            <Notice tone="info">{t('pricing.calculator.notAvailable')}</Notice>
          )}
          {submitError ? (
            <Notice tone="error" live>
              {submitError}
            </Notice>
          ) : null}
        </div>
      </Card>

      <div className="space-y-6">
        <Card as="section" title={t('pricing.breakdown.title')} titleId={`${ids}-breakdown`}>
          {quote ? (
            <QuoteBreakdownList quote={quote} locale={locale} t={t} />
          ) : (
            <p className="text-ink-muted">{t('pricing.breakdown.none')}</p>
          )}
        </Card>
        <TermTable
          comparison={preview.comparison}
          selected={termMonths}
          locale={locale}
          titleId={`${ids}-compare`}
        />
      </div>
    </div>
  );
}

function TermTable({
  comparison,
  selected,
  locale,
  titleId,
}: {
  comparison: TermComparison;
  selected: number;
  locale: Locale;
  titleId: string;
}) {
  const t = getT(locale);
  const money = (cents: number) => <Money cents={cents} locale={locale} />;
  return (
    <Card as="section" title={t('pricing.compare.title')} titleId={titleId} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-labelledby={titleId}>
          <thead className="text-left text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-2 font-medium">
                {t('pricing.compare.term')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('pricing.compare.gross')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('pricing.compare.buyout')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('pricing.compare.totalIfReturn')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('pricing.compare.totalIfBuy')}
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {comparison.rows.map((row) => (
              <tr
                key={row.termMonths}
                className={
                  row.termMonths === selected
                    ? 'border-b border-line bg-muted font-semibold'
                    : 'border-b border-line'
                }
                aria-current={row.termMonths === selected ? 'true' : undefined}
              >
                <th scope="row" className="px-4 py-2 text-left font-medium whitespace-nowrap">
                  {t('pricing.months', { months: row.termMonths })}
                  <span className="block text-xs font-normal text-ink-muted">
                    {t('pricing.compare.band', { band: row.band })}
                  </span>
                </th>
                <td className="px-4 py-2 text-right">{money(row.monthlyGrossCents)}</td>
                <td className="px-4 py-2 text-right">{money(row.buyoutCents)}</td>
                <td className="px-4 py-2 text-right">{money(row.totalIfReturnCents)}</td>
                <td className="px-4 py-2 text-right">{money(row.totalIfBuyCents)}</td>
              </tr>
            ))}
            {comparison.unavailable.map(({ termMonths, reason }) => (
              <tr key={termMonths} className="border-b border-line text-ink-muted">
                <th scope="row" className="px-4 py-2 text-left font-medium whitespace-nowrap">
                  {t('pricing.months', { months: termMonths })}
                </th>
                <td colSpan={4} className="px-4 py-2">
                  {refusalText(t, reason, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
