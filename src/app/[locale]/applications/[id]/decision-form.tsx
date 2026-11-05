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
  /** `forbidden` is shown when the server answers 403 (D39: not the named signatory). */
  labels: { approve: string; reject: string; error: string; forbidden?: string };
};

export function DecisionForm({ applicationId, reviewer, askWho, labels }: DecisionFormProps) {
  const router = useRouter();
  const [who, setWho] = useState(reviewer);
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected') {
    setPending(decision);
    setFailed(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reviewedBy: who }),
      });
      if (response.status === 403 && labels.forbidden) {
        setFailed(labels.forbidden);
        return;
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.refresh();
    } catch {
      setFailed(labels.error);
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
