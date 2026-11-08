'use client';

// Sign out (D91): DELETE /api/session ends the session row and clears the cookie, then the
// browser goes to the home page and the server pages re-render as anonymous.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, type ButtonVariant } from '@/components/ui';

export function SignOutButton({
  home,
  label,
  error,
  variant = 'secondary',
}: {
  home: string;
  label: string;
  error: string;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={variant}
        size="sm"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => null);
            setFailed(!response?.ok);
            if (response?.ok) {
              router.push(home);
              router.refresh();
            }
          })
        }
      >
        {label}
      </Button>
      {failed ? (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      ) : null}
    </span>
  );
}
