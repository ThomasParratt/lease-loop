import { describe, expect, it } from 'vitest';
import { mayDecideAsSignatory, sameEmail } from './signatory';

describe('sameEmail', () => {
  it('ignores case and the spaces around it', () => {
    expect(sameEmail(' Fleet@Norvi.example.com', 'fleet@norvi.example.com ')).toBe(true);
    expect(sameEmail('fleet@norvi.example.com', 'signatory@norvi.example.com')).toBe(false);
    expect(sameEmail(undefined, 'a@b.fi')).toBe(false);
    expect(sameEmail('', '')).toBe(false);
  });
});

describe('mayDecideAsSignatory (D39)', () => {
  const card6 = {
    actor: 'cust-norvi',
    applicantId: 'cust-norvi',
    signatoryEmail: 'signatory@norvi.example.com',
    claimedBy: 'Signatory@Norvi.example.com',
  };

  it('card 6: the named signatory, on the company account, may sign', () => {
    expect(mayDecideAsSignatory(card6)).toBe(true);
  });

  it('the trap: anyone else typed into "who signs" may not', () => {
    expect(mayDecideAsSignatory({ ...card6, claimedBy: 'fleet@norvi.example.com' })).toBe(false);
    expect(mayDecideAsSignatory({ ...card6, claimedBy: 'Jussi' })).toBe(false);
  });

  it('nor may another customer, anonymous or the admin sign for the company', () => {
    for (const actor of ['cust-aino', 'anonymous', 'admin']) {
      expect(mayDecideAsSignatory({ ...card6, actor }), actor).toBe(false);
    }
  });

  it('no signatory named: nobody may sign', () => {
    expect(mayDecideAsSignatory({ ...card6, signatoryEmail: undefined })).toBe(false);
  });
});
