'use client';

// Approve or reject a pending application: POST /api/applications/:id/decision, then re-render.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Notice, inputClasses } from '@/components/ui';

type DecisionFormProps = {
  applicationId: string;
  /** Who decides. Editable when `askWho` is given: the signatory names themself. */
  reviewer: string;
  askWho?: string;
  labels: { approve: string; reject: string; error: string };
};

export function DecisionForm({ applicationId, reviewer, askWho, labels }: DecisionFormProps) {
  const router = useRouter();
  const [who, setWho] = useState(reviewer);
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  const [failed, setFailed] = useState(false);

  async function decide(decision: 'approved' | 'rejected') {
    setPending(decision);
    setFailed(false);
    try {
      const response = await fetch(`/api/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reviewedBy: who }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  const blocked = pending !== null || who.trim() === '';
  return (
    <div className="space-y-4">
      {askWho ? (
        <Field id="decision-who" label={askWho}>
          {(control) => (
            <input
              {...control}
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
      ) : null}
      {failed ? (
        <Notice tone="error" live>
          {labels.error}
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
