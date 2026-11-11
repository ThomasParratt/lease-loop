// POST /api/contracts   body: { "applicationId": "…", "startDate": "2026-11-05" }
// Signs an approved application on the request's day (the demo clock, never a date from the
// body). `startDate` is the business start, checked against that day (D7). Authorized first
// (D73, D74): the applicant or admin, never a case waiting for the company's signatory. The
// contract copies the quote and never re-prices (card 2). A person (consumer, sole trader)
// signs only with a fresh bank identification of themself for this application,
// `identificationId` (D96): 403 IDENTIFICATION_REQUIRED with the reason otherwise.
import { isAuthzRefusal } from '@/domain/authz/policy';
import { checkForSigning, signsInWithBank } from '@/domain/identity/identification';
import { identityHashOfCustomer } from '@/server/accounts';
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { signContractBodySchema } from '@/server/contract-schemas';
import {
  signContract,
  type SignContractRefusal,
  type SigningIdentification,
} from '@/server/contracts';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { findIdentification } from '@/server/identifications';

const STATUS_OF: Partial<Record<SignContractRefusal['code'], number>> = {
  application_not_found: 404,
  already_signed: 409,
  identification_used: 409,
  quote_reserved_for_another_customer: 403,
  asset_not_available: 409,
  not_enough_units: 409,
};

const refused = (status: number, reason: SignContractRefusal) =>
  fail(status, 'SIGNING_REFUSED', 'The contract cannot be signed', reason);

export const POST = handleRoute(async (request) => {
  const actor = await readActor(db);
  const body = await readJsonBody(request, signContractBodySchema);
  const { applicationId } = body;
  const auth = await authorize(db, actor, 'sign_contract', { application: applicationId });
  if (!auth.ok) {
    return refusalResponse(auth.reason, () =>
      refused(404, { code: 'application_not_found', params: { applicationId } })
    );
  }

  // D96: a person identifies again to sign; the route checks it, the service uses it once.
  let identification: SigningIdentification | undefined;
  const applicant = auth.ownerId ? await getCustomer(db, auth.ownerId) : null;
  if (applicant && signsInWithBank(applicant.type)) {
    const now = new Date().toISOString();
    const record = body.identificationId
      ? await findIdentification(db, body.identificationId)
      : null;
    const check = checkForSigning(record, {
      applicationId,
      identityHash: await identityHashOfCustomer(db, applicant.id),
      now,
    });
    if (!check.ok) {
      return fail(403, 'IDENTIFICATION_REQUIRED', 'Identify with your bank to sign', check.reason);
    }
    identification = {
      id: record!.id,
      method: record!.method ?? 'bank',
      transactionId: record!.transactionId ?? '',
      identifiedAt: record!.completedAt!,
      usedAt: now,
    };
  }

  const { identificationId: _unused, ...terms } = body;
  const result = await signContract(
    db,
    { ...terms, actor, identification },
    await todayForRequest(db)
  );
  if (!result.ok) {
    if (isAuthzRefusal(result.reason)) return forbiddenResponse(result.reason);
    return refused(STATUS_OF[result.reason.code] ?? 422, result.reason);
  }
  return ok(result.details, { status: 201 });
});
