'use client';

// Sign or decline through the link: POST /api/sign/:token, then re-render (D46).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';

type SignFormProps = {
  token: string;
  labels: { sign: string; decline: string; error: string };
};

export function SignForm({ token, labels }: SignFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState<'sign' | 'decline' | null>(null);
  const [failed, setFailed] = useState(false);

  async function act(action: 'sign' | 'decline') {
    setPending(action);
    setFailed(false);
    try {
      const response = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Notice tone="error" live>
          {labels.error}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => act('sign')}
          pending={pending === 'sign'}
          disabled={pending !== null}
        >
          {labels.sign}
        </Button>
        <Button
          variant="danger"
          onClick={() => act('decline')}
          pending={pending === 'decline'}
          disabled={pending !== null}
        >
          {labels.decline}
        </Button>
      </div>
    </div>
  );
}
