// D95: the account stores an HMAC of the identity code, keyed from .env, never the code.
import { describe, expect, it } from 'vitest';
import { MissingIdentityKeyError, identityHash } from './identity-hash';

const KEY = { IDENTITY_HASH_KEY: 'k'.repeat(43) };

describe('identityHash', () => {
  it('is the same for the same code and key, and never contains the code', () => {
    const hash = identityHash('120497-9012', KEY);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(identityHash('120497-9012', KEY)).toBe(hash);
    expect(hash).not.toContain('120497');
  });

  it('differs for another code and for another key', () => {
    expect(identityHash('120497-9012', KEY)).not.toBe(identityHash('100309A9007', KEY));
    expect(identityHash('120497-9012', KEY)).not.toBe(
      identityHash('120497-9012', { IDENTITY_HASH_KEY: 'j'.repeat(43) })
    );
  });

  it('refuses to hash without a key, or with a short one (fail closed)', () => {
    expect(() => identityHash('120497-9012', {})).toThrow(MissingIdentityKeyError);
    expect(() => identityHash('120497-9012', { IDENTITY_HASH_KEY: 'short' })).toThrow(
      MissingIdentityKeyError
    );
  });
});
