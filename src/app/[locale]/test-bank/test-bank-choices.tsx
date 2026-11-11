'use client';

// The Test Bank's choices (D97): one button per test person, and cancel. Each posts to the
// Test Bank (POST /api/test-bank/authorize), which answers our callback address with a
// single-use code, and the browser follows it, as it would follow a real broker's redirect.
import { useState, useTransition } from 'react';
import { Button, Notice } from '@/components/ui';

type Person = { customerId: string; name: string; born: string; code: string };

export function TestBankChoices({
  state,
  nonce,
  people,
  labels,
}: {
  state: string;
  nonce: string;
  people: readonly Person[];
  labels: { choose: string; cancel: string; error: string };
}) {
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function send(choice: { customerId: string } | { cancel: true }) {
    setFailed(false);
    startTransition(async () => {
      const response = await fetch('/api/test-bank/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, nonce, ...choice }),
      }).catch(() => null);
      const body = response?.ok ? await response.json().catch(() => null) : null;
      const target: unknown = body?.data?.redirectTo;
      if (typeof target === 'string' && target.startsWith('/api/identifications/callback?')) {
        window.location.assign(target);
        return;
      }
      setFailed(true);
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {people.map((person) => (
          <li key={person.customerId} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0 break-words">
              <p className="font-semibold">{person.name}</p>
              <p className="text-sm text-ink-muted">
                {person.born} · {person.code}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              disabled={pending}
              onClick={() => send({ customerId: person.customerId })}
            >
              {labels.choose}
            </Button>
          </li>
        ))}
      </ul>
      {failed ? (
        <Notice tone="error" live>
          {labels.error}
        </Notice>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => send({ cancel: true })}
      >
        {labels.cancel}
      </Button>
    </div>
  );
}
