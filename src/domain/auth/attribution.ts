// Who an audit row names while the admin acts as a customer (D93). The services write rows with
// the actor they were given, the customer; in a request made from the admin's session the row
// names `admin` as the actor and that customer as `actingAs` in its details. Pure: the server
// passes in the session's account (`null` with no session).

export const ADMIN_ACCOUNT = 'admin';

type Entry = { actor: string; details?: unknown };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The entry as it is recorded. Unchanged (the same object) unless the admin acted as someone. */
export function attributeAuditEntry<E extends Entry>(
  entry: E,
  sessionAccount: string | null
): E & { details?: unknown } {
  if (sessionAccount !== ADMIN_ACCOUNT || entry.actor === ADMIN_ACCOUNT) return entry;
  const actingAs = entry.actor;
  const details =
    entry.details === undefined
      ? { actingAs }
      : isPlainObject(entry.details)
        ? { ...entry.details, actingAs }
        : { value: entry.details, actingAs };
  return { ...entry, actor: ADMIN_ACCOUNT, details };
}
