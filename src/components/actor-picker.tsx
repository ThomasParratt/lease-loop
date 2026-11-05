'use client';

// "Continue as": picks the actor (D17: there is no login). Posts the choice to /api/actor,
// which sets the cookie, then refreshes so the server components read the new actor.
// The page passes in the customers, the current actor and the translated labels.
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

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
    <form onSubmit={onSubmit} className="flex items-center gap-2 text-sm">
      <label htmlFor="actor-picker" className="font-medium text-stone-700 dark:text-stone-300">
        {labels.label}
      </label>
      <select
        id="actor-picker"
        name="actor"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="rounded-md border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
      >
        <option value="">{labels.anonymous}</option>
        <option value="admin">{labels.admin}</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-stone-900 px-3 py-1 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-stone-900"
      >
        {selected === '' && current !== 'anonymous' ? labels.clear : labels.submit}
      </button>
      {failed ? (
        <span role="alert" className="text-red-700 dark:text-red-400">
          {labels.error}
        </span>
      ) : null}
    </form>
  );
}
