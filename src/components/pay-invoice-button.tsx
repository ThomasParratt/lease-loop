'use client';

// "Pay" on one invoice row: POST /api/invoices/:id/pay, then the page reloads with the invoice
// paid. The server pays on its own day (the demo clock) as the actor of its cookie; the browser
// sends nothing. A refusal comes back as a code, written from the message files.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authzRefusalKey } from '@/components/authz-refusal';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { Button } from './ui';

/** The pay route's own refusal codes, each with a message key. */
const REFUSALS: Record<string, MessageKey> = {
  INVOICE_ALREADY_PAID: 'invoice.pay.refusal.already_paid',
  INVOICE_CANCELLED: 'invoice.pay.refusal.cancelled',
  PAID_BEFORE_SIGNING: 'invoice.pay.refusal.before_signing',
};

export function PayInvoiceButton({
  invoiceId,
  sequence,
  locale,
}: {
  invoiceId: string;
  sequence: number;
  locale: Locale;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pay`, {
      method: 'POST',
    }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (!body?.success) {
      const code: unknown = body?.error?.code;
      const authz = authzRefusalKey(body?.error?.details?.code);
      const own = typeof code === 'string' ? REFUSALS[code] : undefined;
      setError(t(authz ?? own ?? 'invoice.pay.refusal.unknown'));
      setPending(false);
      return;
    }
    router.refresh();
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={pay}
        pending={pending}
        pendingLabel={t('invoice.pay.pending')}
        aria-label={t('invoice.pay.label', { sequence })}
      >
        {t('invoice.pay.button')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs whitespace-normal text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
