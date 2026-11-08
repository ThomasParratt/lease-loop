'use client';

// "Act as": the admin's tool to act as a customer (D93). It is shown only to the admin and
// changes only the admin's own session (POST /api/actor); "Myself (admin)" and the "Back to
// admin" button end it (DELETE /api/actor). Then the server pages re-render for the new actor.
// The page passes in the customers, who the admin acts as now and the translated labels.
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button, cx, inputClasses } from '@/components/ui';

export type ActorPickerLabels = {
  label: string;
  admin: string;
  submit: string;
  error: string;
};

function useActorSwitch() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const send = (init: RequestInit) =>
    startTransition(async () => {
      const response = await fetch('/api/actor', init).catch(() => null);
      setFailed(!response?.ok);
      if (response?.ok) router.refresh();
    });
  return { failed, pending, send };
}

export function ActorPicker({
  customers,
  actingAs,
  labels,
}: {
  customers: readonly { id: string; name: string }[];
  /** The customer the admin acts as now, or null. */
  actingAs: string | null;
  labels: ActorPickerLabels;
}) {
  const [selected, setSelected] = useState(actingAs ?? 'admin');
  const { failed, pending, send } = useActorSwitch();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: selected }),
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-w-0 flex-1 items-center justify-end gap-2 text-sm"
    >
      <label htmlFor="actor-picker" className="font-semibold max-sm:sr-only">
        {labels.label}
      </label>
      <select
        id="actor-picker"
        name="actor"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className={cx(inputClasses, 'min-h-9 w-auto max-w-56 min-w-0 py-1 text-sm')}
      >
        <option value="admin">{labels.admin}</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="onDark" size="sm" pending={pending}>
        {labels.submit}
      </Button>
      {failed ? (
        <span role="alert" className="font-semibold">
          {labels.error}
        </span>
      ) : null}
    </form>
  );
}

/** "Back to admin" on the acting-as banner: ends acting as the customer. */
export function StopActingButton({ label, error }: { label: string; error: string }) {
  const { failed, pending, send } = useActorSwitch();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        pending={pending}
        onClick={() => send({ method: 'DELETE' })}
      >
        {label}
      </Button>
      {failed ? (
        <span role="alert" className="font-semibold">
          {error}
        </span>
      ) : null}
    </span>
  );
}
