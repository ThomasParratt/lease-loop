// D93: the session's account is remembered for the request, so withAudit can name the admin.
import { describe, expect, it } from 'vitest';
import { noteSessionAccount, runWithRequestContext, sessionAccount } from './request-context';

describe('request context', () => {
  it('is null outside a request and ignores a note made there', () => {
    noteSessionAccount('admin');
    expect(sessionAccount()).toBeNull();
  });

  it('remembers the account noted inside a request, across awaits, and only there', async () => {
    await Promise.all([
      runWithRequestContext(async () => {
        noteSessionAccount('admin');
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(sessionAccount()).toBe('admin');
      }),
      runWithRequestContext(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        expect(sessionAccount()).toBeNull();
      }),
    ]);
    expect(sessionAccount()).toBeNull();
  });
});
