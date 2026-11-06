'use client';

// Ending a lease: choose buy, return or pass on, report the condition and the usage, and for a
// pass-on name the next person (D16). Each change asks GET /api/contracts/[id]/exit-preview
// (debounced, the previous request aborted) and shows both exits line by line as the server
// planned them; the browser never computes a price or sends a date. "End the lease" posts to
// /api/contracts/[id]/exit and refreshes the page, which then shows the final invoice.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { AssetCondition, UsageUnit } from '@/data/schemas';
import type { ExitMode } from '@/domain/exits';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ExitPreview } from '@/server/exits';
import { authzRefusalKey } from './authz-refusal';
import { exitRefusalValues } from './exit-refusal';
import { ExitOptionList } from './exit-preview';
import { Button, Field, Notice, inputClasses } from './ui';

type ExitFormProps = {
  contractId: string;
  locale: Locale;
  endDate: string;
  conditions: readonly AssetCondition[];
  usageUnit: UsageUnit;
  initial: { condition: AssetCondition; usageValue: number };
  initialPreview: ExitPreview;
  /** Everyone who could take the item next, the leaving customer left out. */
  customers: { id: string; name: string }[];
};

const MODES: readonly ExitMode[] = ['buy', 'return', 'pass_on'];
const DEBOUNCE_MS = 250;

export function ExitForm(props: ExitFormProps) {
  const { contractId, locale, endDate, conditions, usageUnit, customers } = props;
  const t = getT(locale);
  const router = useRouter();
  const ids = useId();
  const [mode, setMode] = useState<ExitMode>(props.initialPreview.mode);
  const [condition, setCondition] = useState<AssetCondition>(props.initial.condition);
  const [usageText, setUsageText] = useState(String(props.initial.usageValue));
  const [nextCustomerId, setNextCustomerId] = useState('');
  const [preview, setPreview] = useState(props.initialPreview);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRun = useRef(true);

  const usageValue = /^\d{1,8}$/.test(usageText) ? Number(usageText) : null;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (usageValue === null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({ mode, condition, usageValue: String(usageValue) });
      try {
        const response = await fetch(`/api/contracts/${contractId}/exit-preview?${query}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (body.success) {
          setPreview(body.data);
          setError(null);
        } else setError(refusalText(body.error?.details));
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') setError(t('exit.error'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `t` and `refusalText` follow `locale`, which does not change on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, mode, condition, usageValue]);

  /** The refusal `{ code, params }` from the error details, with its params (review finding 14). */
  function refusalText(details?: { code?: unknown; params?: Record<string, string | number> }) {
    const authz = authzRefusalKey(details?.code);
    if (authz) return t(authz);
    const key = `exit.refusal.${String(details?.code)}`;
    return key in messages.en
      ? t(key as MessageKey, exitRefusalValues(details?.params, t, locale))
      : t('exit.error');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (usageValue === null) return;
    setError(null);
    const response = await fetch(`/api/contracts/${contractId}/exit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        condition,
        usage: { unit: usageUnit, value: usageValue },
        ...(mode === 'pass_on' && nextCustomerId ? { nextCustomerId } : {}),
      }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (!body?.success) {
      setError(refusalText(body?.error?.details));
      return;
    }
    startTransition(() => router.refresh());
  }

  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const invoice = preview.invoice;
  const returnTitle = preview.atOrAfterEnd ? t('exit.option.returnAtEnd') : t('exit.option.return');

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={loading || pending}>
      <Notice tone={preview.atOrAfterEnd ? 'info' : 'warning'}>
        {t(preview.atOrAfterEnd ? 'exit.atEnd' : 'exit.early', {
          endDate: formatIsoDate(endDate, locale),
          today: formatIsoDate(preview.today, locale),
        })}
      </Notice>

      <fieldset className="space-y-2">
        <legend className="font-medium">{t('exit.mode.label')}</legend>
        <div className="flex flex-wrap gap-2">
          {MODES.map((choice) => (
            <label
              key={choice}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 ring-1 ring-line has-checked:ring-brand"
            >
              <input
                type="radio"
                name={`${ids}-mode`}
                value={choice}
                checked={mode === choice}
                onChange={() => setMode(choice)}
              />
              {t(`exit.mode.${choice}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${ids}-condition`} label={t('exit.condition')} hint={t('exit.conditionHint')}>
          {(control) => (
            <select
              className={inputClasses}
              value={condition}
              onChange={(e) => setCondition(e.target.value as AssetCondition)}
              {...control}
            >
              {conditions.map((value) => (
                <option key={value} value={value}>
                  {t(`condition.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          id={`${ids}-usage`}
          label={t(`exit.usage.${usageUnit}`)}
          error={usageValue === null ? t('exit.usageInvalid') : undefined}
        >
          {(control) => (
            <input
              className={inputClasses}
              inputMode="numeric"
              value={usageText}
              onChange={(e) => setUsageText(e.target.value.trim())}
              {...control}
              aria-invalid={usageValue === null ? true : undefined}
            />
          )}
        </Field>
      </div>

      {mode === 'pass_on' ? (
        <Field id={`${ids}-next`} label={t('exit.next')} hint={t('exit.nextHint')}>
          {(control) => (
            <select
              className={inputClasses}
              value={nextCustomerId}
              onChange={(e) => setNextCustomerId(e.target.value)}
              {...control}
            >
              <option value="">{t('exit.nextChoose')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <ExitOptionList
          title={t('exit.option.buy')}
          option={preview.buy}
          locale={locale}
          t={t}
          chosen={mode === 'buy'}
        />
        <ExitOptionList
          title={returnTitle}
          option={preview.return}
          locale={locale}
          t={t}
          chosen={mode !== 'buy'}
        />
      </div>

      <p className="text-sm" aria-live="polite">
        {loading
          ? t('exit.updating')
          : invoice
            ? t('exit.invoice', {
                net: euro(invoice.netCents),
                rate: formatNumber(invoice.vatRateBasisPoints / 100, locale),
                gross: euro(invoice.grossCents),
                date: formatIsoDate(invoice.dueDate, locale),
              })
            : t(preview.atOrAfterEnd && mode !== 'buy' ? 'exit.noInvoiceAtEnd' : 'exit.noInvoice')}
        {preview.cancelInvoiceIds.length > 0
          ? ` ${t('exit.cancelled', { count: preview.cancelInvoiceIds.length })}`
          : ''}
      </p>

      {error ? (
        <Notice tone="error" live>
          {error}
        </Notice>
      ) : null}

      <Button
        type="submit"
        variant={mode === 'buy' ? 'primary' : 'secondary'}
        disabled={
          pending || loading || usageValue === null || (mode === 'pass_on' && !nextCustomerId)
        }
      >
        {pending ? t('exit.pending') : t(`exit.submit.${mode}`)}
      </Button>
    </form>
  );
}
