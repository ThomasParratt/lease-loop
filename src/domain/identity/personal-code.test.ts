// D95, D97: the Finnish personal identity code (henkilötunnus): DDMMYY, a century sign, a
// three-digit individual number and a check character, the nine digits modulo 31. The Test
// Bank gives the data pack's people artificial codes, individual numbers 900 to 999.
import { describe, expect, it } from 'vitest';
import { parsePersonalCode, testPersonalCode } from './personal-code';

describe('parsePersonalCode', () => {
  it("reads the Digital and Population Data Services Agency's example, 131052-308T", () => {
    expect(parsePersonalCode('131052-308T')).toEqual({
      ok: true,
      birthDate: '1952-10-13',
      individualNumber: 308,
      artificial: false,
    });
  });

  it('reads the century signs: + for the 1800s, - and Y to U for the 1900s, A to F for the 2000s', () => {
    expect(parsePersonalCode('100309A9007')).toMatchObject({
      birthDate: '2009-03-10',
      artificial: true,
    });
    expect(parsePersonalCode('131052Y308T')).toMatchObject({ birthDate: '1952-10-13' });
    expect(parsePersonalCode('131052+308T')).toMatchObject({ birthDate: '1852-10-13' });
  });

  it('refuses a wrong check character, a day that does not exist and anything malformed', () => {
    for (const code of [
      '131052-308A',
      '290201A9990',
      '320152-308T',
      '131052-308',
      '131052G308T',
      '131052-000T',
      ' 131052-308T',
      '131052-308t',
    ]) {
      expect(parsePersonalCode(code), code).toEqual({ ok: false });
    }
  });

  it('accepts 29 February in a leap year only', () => {
    expect(parsePersonalCode('290200A999J')).toMatchObject({ ok: true, birthDate: '2000-02-29' });
  });
});

describe('testPersonalCode', () => {
  it("builds Mikko's artificial code from his birth date (card 5: born 10 Mar 2009)", () => {
    expect(testPersonalCode('2009-03-10', 900)).toBe('100309A9007');
  });

  it('uses - for the 1900s and round-trips through parsePersonalCode', () => {
    const code = testPersonalCode('1997-04-12', 901);
    expect(code).toBe('120497-9012');
    expect(parsePersonalCode(code)).toEqual({
      ok: true,
      birthDate: '1997-04-12',
      individualNumber: 901,
      artificial: true,
    });
  });

  it('refuses an individual number outside 900 to 999, and a birth date outside 1900 to 2099', () => {
    expect(() => testPersonalCode('1997-04-12', 899)).toThrow(/900/);
    expect(() => testPersonalCode('1997-04-12', 1000)).toThrow(/900/);
    expect(() => testPersonalCode('1899-12-31', 900)).toThrow(/1900/);
    expect(() => testPersonalCode('1997-02-30', 900)).toThrow(/date/);
  });
});
