// D97: the Test Bank lists the data pack's people with artificial codes and redeems each code
// once, within two minutes, for the person and the nonce it was given.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCustomers } from '@/data/load';
import { parsePersonalCode } from '@/domain/identity/personal-code';
import {
  grantAtTestBank,
  redeemAtTestBank,
  testBankAuthorizeUrl,
  testBankOn,
  testPeople,
} from './test-bank';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('testPeople', () => {
  it('lists the consumers and sole traders, no company, each with a valid artificial code', async () => {
    const people = testPeople(await loadCustomers());
    expect(people.map((p) => p.customerId)).toEqual([
      'cust-aino',
      'cust-lena',
      'cust-mikko',
      'cust-olavi',
      'cust-pekka',
      'cust-sanna',
    ]);
    for (const person of people) {
      expect(parsePersonalCode(person.personalCode)).toMatchObject({
        ok: true,
        birthDate: person.birthDate,
        artificial: true,
      });
    }
    expect(people.find((p) => p.customerId === 'cust-aino')?.personalCode).toBe('120497-9001');
  });
});

describe('grantAtTestBank and redeemAtTestBank', () => {
  const person = {
    customerId: 'cust-aino',
    name: 'Aino Virtanen',
    birthDate: '1997-04-12',
    personalCode: '120497-9002',
  };

  it('redeems a code once, with the nonce and a transaction id', () => {
    const code = grantAtTestBank(person, 'nonce-1', 0);
    expect(redeemAtTestBank(code, 1000)).toMatchObject({
      personalCode: '120497-9002',
      name: 'Aino Virtanen',
      nonce: 'nonce-1',
      method: 'test_bank',
      transactionId: expect.stringMatching(/^test-/),
    });
    expect(redeemAtTestBank(code, 1000)).toBeNull();
  });

  it('refuses a code after two minutes, and one it never gave', () => {
    const code = grantAtTestBank(person, 'n', 0);
    expect(redeemAtTestBank(code, 120_000)).toBeNull();
    expect(redeemAtTestBank('made-up', 0)).toBeNull();
  });
});

describe('the switch and the address', () => {
  it('is on with the demo tools only, and sends the browser to its own page', () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    expect(testBankOn()).toBe(false);
    vi.stubEnv('DEMO_TOOLS', '1');
    expect(testBankOn()).toBe(true);
    expect(testBankAuthorizeUrl('fi', 's t', 'n')).toBe('/fi/test-bank?state=s+t&nonce=n');
  });
});
