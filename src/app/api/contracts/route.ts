// POST /api/contracts   body: { "applicationId": "…", "startDate": "2026-11-05" }
// Signs an approved application on the request's day (the demo clock, never a date from the
// body). `startDate` is the business start, checked against that day (D7). The applicant or
// admin may sign; the contract copies the quote and never re-prices (card 2).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { signContractBodySchema } from '@/server/contract-schemas';
import { signContract, type SignContractRefusal } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

const STATUS_OF: Partial<Record<SignContractRefusal['code'], number>> = {
  application_not_found: 404,
  not_allowed_to_sign: 403,
  already_signed: 409,
  asset_not_available: 409,
};

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, signContractBodySchema);
  const today = await todayForRequest();
  const actor = await readActor(db);

  const result = await signContract(db, { ...body, actor }, today);
  if (!result.ok) {
    const status = STATUS_OF[result.reason.code] ?? 422;
    return fail(status, 'SIGNING_REFUSED', 'The contract cannot be signed', result.reason);
  }
  return ok(result.details, { status: 201 });
});
