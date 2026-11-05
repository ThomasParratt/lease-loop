import { describe, expect, it } from 'vitest';
import { parseTamperArgs, tamperedDetails } from './tamper-audit.mjs';

describe('parseTamperArgs', () => {
  it('takes the newest row by default and --id <n> otherwise', () => {
    expect(parseTamperArgs([])).toBeNull();
    expect(parseTamperArgs(['--id', '3'])).toBe(3);
  });

  it('refuses anything else', () => {
    expect(() => parseTamperArgs(['--id'])).toThrow('usage');
    expect(() => parseTamperArgs(['--id', '0'])).toThrow('usage');
    expect(() => parseTamperArgs(['3'])).toThrow('usage');
  });
});

describe('tamperedDetails', () => {
  it('adds tampered: true to object details', () => {
    expect(tamperedDetails('{"to":"reserved"}')).toBe('{"to":"reserved","tampered":true}');
  });

  it('wraps null, a scalar or non-JSON text', () => {
    expect(tamperedDetails(null)).toBe('{"value":null,"tampered":true}');
    expect(tamperedDetails('7')).toBe('{"value":7,"tampered":true}');
    expect(tamperedDetails('oops')).toBe('{"original":"oops","tampered":true}');
  });
});
