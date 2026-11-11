// D95, D96: an identification request lives 10 minutes, completes once and only in the browser
// that started it; a signature needs a completed identification of the same person, for the
// same application, at most 10 minutes old, used once.
import { describe, expect, it } from 'vitest';
import {
  IDENTIFICATION_MINUTES,
  SIGNING_FRESH_MINUTES,
  checkCallback,
  checkForSigning,
  identificationExpiry,
  signsInWithBank,
  type IdentificationRecord,
} from './identification';

const STARTED = '2026-11-11T10:00:00.000Z';
const request: IdentificationRecord = {
  purpose: 'sign_contract',
  subject: 'app-1',
  expiresAt: identificationExpiry(STARTED),
  completedAt: null,
  usedAt: null,
  identityHash: null,
};
const completed: IdentificationRecord = {
  ...request,
  completedAt: '2026-11-11T10:01:00.000Z',
  identityHash: 'aino',
};
const at = (minutes: number) => new Date(Date.parse(STARTED) + minutes * 60_000).toISOString();
const codeOf = (decision: { ok: boolean; reason?: { code: string } }) =>
  decision.ok ? 'ok' : decision.reason!.code;

describe('identificationExpiry', () => {
  it(`gives a request ${IDENTIFICATION_MINUTES} minutes`, () => {
    expect(identificationExpiry(STARTED)).toBe('2026-11-11T10:10:00.000Z');
  });
});

describe('checkCallback', () => {
  it('accepts the browser that started it, before it expires, once', () => {
    expect(checkCallback(request, { sameBrowser: true, now: at(9) })).toEqual({ ok: true });
  });

  it('refuses an unknown request, another browser, an expired one and a second completion', () => {
    expect(codeOf(checkCallback(null, { sameBrowser: true, now: at(1) }))).toBe(
      'identification_not_found'
    );
    expect(codeOf(checkCallback(request, { sameBrowser: false, now: at(1) }))).toBe(
      'identification_other_browser'
    );
    expect(codeOf(checkCallback(request, { sameBrowser: true, now: at(10) }))).toBe(
      'identification_expired'
    );
    expect(codeOf(checkCallback(completed, { sameBrowser: true, now: at(2) }))).toBe(
      'identification_already_completed'
    );
  });
});

describe('checkForSigning', () => {
  const ask = (
    record: IdentificationRecord | null,
    minutes: number,
    identityHash: string | null = 'aino'
  ) => codeOf(checkForSigning(record, { applicationId: 'app-1', identityHash, now: at(minutes) }));

  it(`accepts the applicant's own identification for this application within ${SIGNING_FRESH_MINUTES} minutes`, () => {
    expect(ask(completed, 10)).toBe('ok');
    // Completed at 10:01: exactly 10 minutes old at 10:11 is still fresh.
    expect(ask(completed, 11)).toBe('ok');
  });

  it('refuses each way it could be wrong, with its own code', () => {
    expect(ask(null, 2)).toBe('identification_required');
    expect(ask({ ...completed, purpose: 'sign_in' }, 2)).toBe('identification_other_purpose');
    expect(ask({ ...completed, subject: 'app-2' }, 2)).toBe('identification_other_purpose');
    expect(ask(request, 2)).toBe('identification_not_completed');
    expect(ask(completed, 11.001)).toBe('identification_stale');
    expect(ask({ ...completed, usedAt: at(3) }, 4)).toBe('identification_used');
    expect(ask(completed, 2, 'mikko')).toBe('identification_other_person');
    expect(ask(completed, 2, null)).toBe('identification_other_person');
  });

  it('treats an unreadable instant as stale (fail closed)', () => {
    expect(ask({ ...completed, completedAt: 'soon' }, 2)).toBe('identification_stale');
  });
});

describe('signsInWithBank', () => {
  it('is true for people (consumers and sole traders), false for companies (D95)', () => {
    expect(signsInWithBank('consumer')).toBe(true);
    expect(signsInWithBank('sole_trader')).toBe(true);
    expect(signsInWithBank('company')).toBe(false);
  });
});
