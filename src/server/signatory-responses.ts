// The envelopes of the signatory and signing-link routes (D46): every refusal of
// src/server/signatories.ts as one `fail()` with its status and code, never a raw message.
import { fail } from './api-response';
import type { AddSignatoryResult, RevokeSignatoryResult, SignByTokenResult } from './signatories';

type Refusal<R> = R extends { ok: false; reason: infer Reason } ? Reason : never;

type SignatoryRefusal = Refusal<AddSignatoryResult> | Refusal<RevokeSignatoryResult>;

const SIGNATORY: Record<SignatoryRefusal, [number, string, string]> = {
  not_found: [404, 'SIGNATORY_NOT_FOUND', 'No such company or signatory'],
  not_allowed: [
    403,
    'NOT_ALLOWED',
    'Only the company’s own signatory or the admin changes the list',
  ],
  already_listed: [409, 'SIGNATORY_ALREADY_LISTED', 'That e-mail is already on the list'],
  invalid_dates: [400, 'INVALID_DATES', 'The end must come after the start'],
  already_ended: [409, 'SIGNATORY_ALREADY_ENDED', 'That signatory’s right has already ended'],
  last_signatory: [409, 'LAST_SIGNATORY', 'The last active signatory cannot be revoked'],
};

/** A refused change to the signatory list. */
export function signatoryFailure(reason: SignatoryRefusal): Response {
  const [status, code, message] = SIGNATORY[reason];
  return fail(status, code, message);
}

const SIGNING: Record<Refusal<SignByTokenResult>, [number, string, string]> = {
  not_found: [404, 'SIGNING_LINK_NOT_FOUND', 'No signing link with that token'],
  expired: [410, 'SIGNING_LINK_EXPIRED', 'The signing link has expired'],
  already_used: [409, 'SIGNING_LINK_USED', 'The signing link has already been used'],
  signatory_not_active: [403, 'SIGNATORY_NOT_ACTIVE', 'The signatory’s right has ended'],
  not_pending: [409, 'APPLICATION_NOT_PENDING', 'The application is already decided'],
};

/** A refused sign or decline through the link. */
export function signingFailure(reason: Refusal<SignByTokenResult>): Response {
  const [status, code, message] = SIGNING[reason];
  return fail(status, code, message);
}
