// The Test Bank (D97): a mock identification broker, so the strong-identification flow can be
// built and tested before a real broker is set up. It is on only while the demo tools are on
// (D74). It plays the broker's two parts: the page where a person identifies (a list of the
// data pack's people, each with an artificial identity code), and the single-use code our
// callback redeems for the verified person. A real broker replaces this module only. It must
// never look like, or be named after, a real bank.
import { randomBytes, randomUUID } from 'node:crypto';
import type { Customer } from '@/data/schemas';
import { signsInWithBank } from '@/domain/identity/identification';
import { testPersonalCode } from '@/domain/identity/personal-code';
import { demoToolsOn } from './demo-tools';

export const TEST_BANK_METHOD = 'test_bank';

/** A person the Test Bank can identify. */
export type TestPerson = {
  customerId: string;
  name: string;
  birthDate: string;
  personalCode: string;
};

/** What the broker says about the person it identified. */
export type VerifiedPerson = {
  personalCode: string;
  name: string;
  birthDate: string;
  nonce: string;
  method: string;
  transactionId: string;
};

/** The data pack's people, by id, each with an artificial code: individual number 900 upwards. */
export function testPeople(customers: readonly Customer[]): TestPerson[] {
  return customers
    .filter((customer) => signsInWithBank(customer.type) && 'birth_date' in customer)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((customer, index) => {
      const birthDate = 'birth_date' in customer ? customer.birth_date : '';
      return {
        customerId: customer.id,
        name: customer.name,
        birthDate,
        personalCode: testPersonalCode(birthDate, 900 + index),
      };
    });
}

const GRANT_SECONDS = 120;
const MAX_GRANTS = 1000;
type Grant = { person: TestPerson; nonce: string; expiresMs: number };
// Kept on globalThis so a dev-server reload does not lose a code between the two requests.
const store = globalThis as typeof globalThis & { leaseLoopTestBank?: Map<string, Grant> };
const grants = (store.leaseLoopTestBank ??= new Map<string, Grant>());

/** Whether the Test Bank answers: only while the demo tools are on. */
export function testBankOn(): boolean {
  return demoToolsOn();
}

/** Where the browser goes to identify: the Test Bank's page, with the request's state and nonce. */
export function testBankAuthorizeUrl(locale: string, state: string, nonce: string): string {
  const query = new URLSearchParams({ state, nonce });
  return `/${locale}/test-bank?${query.toString()}`;
}

/** The person chose to identify: a single-use code for our callback, valid two minutes. */
export function grantAtTestBank(person: TestPerson, nonce: string, nowMs: number): string {
  for (const [code, grant] of grants) {
    if (grant.expiresMs <= nowMs || grants.size >= MAX_GRANTS) grants.delete(code);
  }
  const code = randomBytes(24).toString('base64url');
  grants.set(code, { person, nonce, expiresMs: nowMs + GRANT_SECONDS * 1000 });
  return code;
}

/** The verified person for `code`, once; null for an unknown, used or expired code. */
export function redeemAtTestBank(code: string, nowMs: number): VerifiedPerson | null {
  const grant = grants.get(code);
  grants.delete(code);
  if (!grant || grant.expiresMs <= nowMs) return null;
  const { personalCode, name, birthDate } = grant.person;
  return {
    personalCode,
    name,
    birthDate,
    nonce: grant.nonce,
    method: TEST_BANK_METHOD,
    transactionId: `test-${randomUUID()}`,
  };
}
