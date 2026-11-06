'use client';

// The admin approves or rejects a manual review: POST /api/applications/:id/decision, then
// re-render. A case waiting for the signatory is signed through the signing link (D46).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';

type DecisionFormProps = {
  applicationId: string;
  /** Who decides: the admin. */
  reviewer: string;
  labels: { approve: string; reject: string; error: string };
};

export function DecisionForm({ applicationId, reviewer, labels }: DecisionFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected') {
    setPending(decision);
    setFailed(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reviewedBy: reviewer }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.refresh();
    } catch {
      setFailed(labels.error);
    } finally {
      setPending(null);
    }
  }

  const blocked = pending !== null;
  return (
    <div className="space-y-4">
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => decide('approved')}
          pending={pending === 'approved'}
          disabled={blocked}
        >
          {labels.approve}
        </Button>
        <Button
          variant="danger"
          onClick={() => decide('rejected')}
          pending={pending === 'rejected'}
          disabled={blocked}
        >
          {labels.reject}
        </Button>
      </div>
    </div>
  );
}
