// What one API request knows about its session beyond the actor (D93): the session's own
// account, so withAudit can name the admin when the admin acts as a customer. `handleRoute`
// opens the context; `readSession` notes the account. Outside a request it is always null.
import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = { sessionAccount: string | null };

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `work` with a fresh context of its own. */
export function runWithRequestContext<T>(work: () => Promise<T>): Promise<T> {
  return storage.run({ sessionAccount: null }, work);
}

/** Remembers the session's account for the rest of the request (ignored outside one). */
export function noteSessionAccount(account: string | null): void {
  const context = storage.getStore();
  if (context) context.sessionAccount = account;
}

/** The session's account noted in this request, or null. */
export function sessionAccount(): string | null {
  return storage.getStore()?.sessionAccount ?? null;
}
