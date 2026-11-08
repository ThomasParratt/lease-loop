// D91, D92: the sign-in form's e-mail is compared trimmed and in lower case; a new password is
// 12 to 128 characters (the upper bound caps the scrypt work one request can ask for).
import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkNewPassword,
  normaliseEmail,
} from './credentials';

describe('normaliseEmail', () => {
  it('trims and lower-cases, so "  Aino.Virtanen@Example.com " finds Aino', () => {
    expect(normaliseEmail('  Aino.Virtanen@Example.com ')).toBe('aino.virtanen@example.com');
  });

  it('keeps everything else as it is', () => {
    expect(normaliseEmail('pekka+lease@example.com')).toBe('pekka+lease@example.com');
  });
});

describe('checkNewPassword', () => {
  it(`accepts ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`, () => {
    expect(checkNewPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toEqual({ ok: true });
    expect(checkNewPassword('a'.repeat(PASSWORD_MAX_LENGTH))).toEqual({ ok: true });
  });

  it('refuses one character too short or too long, with the bound', () => {
    expect(checkNewPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toEqual({
      ok: false,
      reason: { code: 'password_too_short', params: { min: PASSWORD_MIN_LENGTH } },
    });
    expect(checkNewPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: { code: 'password_too_long', params: { max: PASSWORD_MAX_LENGTH } },
    });
  });

  it('counts characters, not bytes: twelve "ä" are enough', () => {
    expect(checkNewPassword('ä'.repeat(12))).toEqual({ ok: true });
  });

  it('counts an emoji as one character', () => {
    expect(checkNewPassword('🔑'.repeat(11))).toMatchObject({ ok: false });
    expect(checkNewPassword('🔑'.repeat(12))).toEqual({ ok: true });
  });
});
