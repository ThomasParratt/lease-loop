'use client';

// "Identify with your bank" (D95, D96): starts a strong identification (POST
// /api/identifications), which sets this browser's state cookie, then leaves for the broker's
// page it answers (the Test Bank for now, D97). The broker sends the browser back to our
// callback, which signs the person in or returns to the application to sign.
import { useState, useTransition } from 'react';
import type { Locale } from '@/i18n/locales';
import { Button, Notice } from './ui';

type Props = {
  purpose: 'sign_in' | 'sign_contract';
  locale: Locale;
  /** The page to come back to: a path of this site. */
  next: string;
  applicationId?: string;
  labels: { button: string; pending: string; error: string };
};

export function BankIdentifyButton({ purpose, locale, next, applicationId, labels }: Props) {
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function identify() {
    setFailed(false);
    startTransition(async () => {
      const response = await fetch('/api/identifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          purpose,
          locale,
          next,
          ...(applicationId ? { applicationId } : {}),
        }),
      }).catch(() => null);
      const body = response?.ok ? await response.json().catch(() => null) : null;
      const target: unknown = body?.data?.redirectTo;
      // Only a path of this site: the broker's page is ours too while it is the Test Bank.
      if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')) {
        window.location.assign(target);
        return;
      }
      setFailed(true);
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={identify} pending={pending} pendingLabel={labels.pending}>
        {labels.button}
      </Button>
      {failed ? (
        <Notice tone="error" live>
          {labels.error}
        </Notice>
      ) : null}
    </div>
  );
}
