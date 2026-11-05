import { describe, expect, it } from 'vitest';
import { addDays } from './days';

describe('addDays', () => {
  it('gives a quote from 2026-11-05 a validity to 2026-11-19 (D7, 14 days)', () => {
    expect(addDays('2026-11-05', 14)).toBe('2026-11-19');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-11-25', 14)).toBe('2026-12-09');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
  });

  it('knows leap days', () => {
    expect(addDays('2028-02-20', 9)).toBe('2028-02-29');
    expect(addDays('2027-02-20', 9)).toBe('2027-03-01');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('adds zero and negative days', () => {
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('throws on a malformed day or a fractional count', () => {
    expect(() => addDays('2026-13-01', 1)).toThrow(RangeError);
    expect(() => addDays('5.11.2026', 1)).toThrow(RangeError);
    expect(() => addDays('2026-11-05', 1.5)).toThrow(RangeError);
  });
});
