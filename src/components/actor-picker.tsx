'use client';

// "Continue as": picks the actor (D17: there is no login). Posts the choice to /api/actor,
// which sets the cookie, then refreshes so the server components read the new actor.
// The page passes in the customers, the current actor and the translated labels.
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button, cx, inputClasses } from '@/components/ui';

export type ActorPickerLabels = {
  label: string;
  anonymous: string;
  admin: string;
  submit: string;
  clear: string;
  error: string;
};

export function ActorPicker({
  customers,
  current,
  labels,
}: {
  customers: readonly { id: string; name: string }[];
  current: string;
  labels: ActorPickerLabels;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current === 'anonymous' ? '' : current);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function send(init: RequestInit) {
    startTransition(async () => {
      const response = await fetch('/api/actor', init).catch(() => null);
      setFailed(!response?.ok);
      if (response?.ok) router.refresh();
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === '') {
      send({ method: 'DELETE' });
      return;
    }
    send({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: selected }),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="actor-picker" className="font-medium text-ink-muted">
        {labels.label}
      </label>
      <select
        id="actor-picker"
        name="actor"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className={cx(inputClasses, 'w-auto max-w-56 text-sm')}
      >
        <option value="">{labels.anonymous}</option>
        <option value="admin">{labels.admin}</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" size="sm" pending={pending}>
        {selected === '' && current !== 'anonymous' ? labels.clear : labels.submit}
      </Button>
      {failed ? (
        <span role="alert" className="text-danger-ink">
          {labels.error}
        </span>
      ) : null}
    </form>
  );
}
