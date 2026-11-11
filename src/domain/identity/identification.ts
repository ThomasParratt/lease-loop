// The rules of strong identification (D95, D96). A request lives 10 minutes and completes once,
// only in the browser that started it (its `state` cookie). A contract is signed only with a
// completed identification of the applicant, for that application, at most 10 minutes old and
// not used before. People (consumers and sole traders) identify; companies do not yet (D97).
// Instants are ISO strings passed in; this module never reads a clock.
import { z } from 'zod';

export const IDENTIFICATION_MINUTES = 10;
export const SIGNING_FRESH_MINUTES = 10;

export const identificationPurposeSchema = z.enum(['sign_in', 'sign_contract']);
export type IdentificationPurpose = z.infer<typeof identificationPurposeSchema>;

export type IdentificationRecord = {
  purpose: IdentificationPurpose;
  /** The application a signing identification is for; null for sign-in. */
  subject: string | null;
  expiresAt: string;
  completedAt: string | null;
  usedAt: string | null;
  /** The HMAC of the identified person's code, set on completion. */
  identityHash: string | null;
};

type Refusal<C extends string> = { ok: false; reason: { code: C; params: Record<string, never> } };
const refuse = <C extends string>(code: C): Refusal<C> => ({
  ok: false,
  reason: { code, params: {} },
});

const minutesAfter = (instant: string, minutes: number) =>
  new Date(Date.parse(instant) + minutes * 60_000).toISOString();

/** When a request started at `startedAt` stops being completable. */
export function identificationExpiry(startedAt: string): string {
  return minutesAfter(startedAt, IDENTIFICATION_MINUTES);
}

export type CallbackRefusal =
  | 'identification_not_found'
  | 'identification_other_browser'
  | 'identification_expired'
  | 'identification_already_completed';

/** Whether the broker's answer may complete `record` at `now`. */
export function checkCallback(
  record: IdentificationRecord | null,
  context: { sameBrowser: boolean; now: string }
): { ok: true } | Refusal<CallbackRefusal> {
  if (!record) return refuse('identification_not_found');
  if (!context.sameBrowser) return refuse('identification_other_browser');
  if (record.completedAt !== null) return refuse('identification_already_completed');
  const end = Date.parse(record.expiresAt);
  const at = Date.parse(context.now);
  if (Number.isNaN(end) || Number.isNaN(at) || at >= end) return refuse('identification_expired');
  return { ok: true };
}

export type SigningIdentificationRefusal =
  | 'identification_required'
  | 'identification_other_purpose'
  | 'identification_not_completed'
  | 'identification_stale'
  | 'identification_used'
  | 'identification_other_person';

/** Whether `record` lets the person with `identityHash` sign `applicationId` at `now` (D96). */
export function checkForSigning(
  record: IdentificationRecord | null,
  context: { applicationId: string; identityHash: string | null; now: string }
): { ok: true } | Refusal<SigningIdentificationRefusal> {
  if (!record) return refuse('identification_required');
  if (record.purpose !== 'sign_contract' || record.subject !== context.applicationId) {
    return refuse('identification_other_purpose');
  }
  if (record.completedAt === null || record.identityHash === null) {
    return refuse('identification_not_completed');
  }
  if (record.usedAt !== null) return refuse('identification_used');
  const done = Date.parse(record.completedAt);
  const at = Date.parse(context.now);
  if (Number.isNaN(done) || Number.isNaN(at) || at - done > SIGNING_FRESH_MINUTES * 60_000) {
    return refuse('identification_stale');
  }
  if (context.identityHash === null || record.identityHash !== context.identityHash) {
    return refuse('identification_other_person');
  }
  return { ok: true };
}

/** People sign in and sign with their bank; a company's account uses its password (D95, D97). */
export function signsInWithBank(customerType: string): boolean {
  return customerType === 'consumer' || customerType === 'sole_trader';
}
