'use client';

// The sign-in form (D91): e-mail and password only; the customer type is the record's (D92).
// Posts to POST /api/session, which sets the HttpOnly cookie, then goes to `next` (already made
// safe by the page) and re-renders the server pages. The server's answer is never shown raw:
// each failure code picks one of the page's texts.
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button, Field, Notice, inputClasses } from '@/components/ui';

export type SignInLabels = {
  email: string;
  password: string;
  submit: string;
  pending: string;
  invalid: string;
  rateLimited: string;
  error: string;
};

type Failure = 'invalid' | 'rateLimited' | 'error';

export function SignInForm({ next, labels }: { next: string; labels: SignInLabels }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    startTransition(async () => {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).catch(() => null);
      if (response?.ok) {
        setPassword('');
        router.push(next);
        router.refresh();
        return;
      }
      setFailure(
        response?.status === 401 ? 'invalid' : response?.status === 429 ? 'rateLimited' : 'error'
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
      <Field id="sign-in-email" label={labels.email}>
        {(control) => (
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClasses}
            {...control}
          />
        )}
      </Field>
      <Field id="sign-in-password" label={labels.password}>
        {(control) => (
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={512}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClasses}
            {...control}
          />
        )}
      </Field>
      {failure ? (
        <Notice tone="error" live>
          {labels[failure]}
        </Notice>
      ) : null}
      <Button type="submit" pending={pending} pendingLabel={labels.pending}>
        {labels.submit}
      </Button>
    </form>
  );
}
