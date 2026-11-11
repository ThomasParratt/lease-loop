// POST /api/test-bank/authorize   body: { state, nonce, customerId } or { state, nonce, cancel: true }
// The Test Bank's own step (D97), the part a real broker does on its site: the person chosen on
// the Test Bank page is granted a single-use code, and the browser is sent to our callback with
// it and the state. Cancel sends it back with no code. Only while the demo tools are on.
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listCustomers } from '@/server/customers';
import { db } from '@/server/db';
import { testBankAuthorizeBodySchema } from '@/server/identification-schemas';
import { grantAtTestBank, testBankOn, testPeople } from '@/server/test-bank';

const callback = (query: Record<string, string>) =>
  `/api/identifications/callback?${new URLSearchParams(query).toString()}`;

export const POST = handleRoute(async (request) => {
  if (!testBankOn()) return fail(404, 'NOT_FOUND', 'The Test Bank is off');
  const body = await readJsonBody(request, testBankAuthorizeBodySchema);
  if (body.cancel || !body.customerId) return ok({ redirectTo: callback({ state: body.state }) });
  const person = testPeople(await listCustomers(db)).find((p) => p.customerId === body.customerId);
  if (!person) return fail(404, 'NOT_FOUND', 'No test person with that id');
  const code = grantAtTestBank(person, body.nonce, Date.now());
  return ok({ redirectTo: callback({ state: body.state, code }) });
});
