import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureEnvFile,
  ensureEnvValue,
  ensureSigningKey,
  newIdentityKey,
  newPassword,
  newSigningKey,
} from './ensure-env.mjs';

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'ensure-env-'));
  writeFileSync(path.join(root, '.env.example'), 'DATABASE_URL="file:./dev.db"\n');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ensureEnvFile', () => {
  it('copies .env.example to .env when .env is missing', () => {
    expect(ensureEnvFile(root)).toBe('created');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_URL="file:./dev.db"\n');
  });

  it('never overwrites an existing .env', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="file:./mine.db"\n');
    expect(ensureEnvFile(root)).toBe('exists');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_URL="file:./mine.db"\n');
  });
});

describe('ensureSigningKey (D81)', () => {
  const env = () => readFileSync(path.join(root, '.env'), 'utf8');
  const fixedKey = () => 'KEY123';

  it('fills the empty placeholder that .env.example carries', () => {
    writeFileSync(
      path.join(root, '.env'),
      'DATABASE_URL="x"\nAUDIT_SIGNING_KEY=""\nDEMO_TOOLS="1"\n'
    );
    expect(ensureSigningKey(root, fixedKey)).toBe('added');
    expect(env()).toBe('DATABASE_URL="x"\nAUDIT_SIGNING_KEY="KEY123"\nDEMO_TOOLS="1"\n');
  });

  it('appends a key to an older .env without the line, on a line of its own', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="x"');
    expect(ensureSigningKey(root, fixedKey)).toBe('added');
    expect(env()).toBe('DATABASE_URL="x"\nAUDIT_SIGNING_KEY="KEY123"\n');
  });

  it('never replaces a key that is there', () => {
    writeFileSync(path.join(root, '.env'), 'AUDIT_SIGNING_KEY="mine"\n');
    expect(ensureSigningKey(root, fixedKey)).toBe('exists');
    expect(env()).toBe('AUDIT_SIGNING_KEY="mine"\n');
  });

  it('generates a base64 PKCS#8 Ed25519 key by default', () => {
    expect(newSigningKey()).toMatch(/^MC4CAQAwBQYDK2VwBCIEI[A-Za-z0-9+/]{43}$/);
  });
});

describe('ensureEnvValue and newPassword (D92)', () => {
  const env = () => readFileSync(path.join(root, '.env'), 'utf8');

  it('fills an empty password line and keeps one that is set', () => {
    writeFileSync(path.join(root, '.env'), 'ADMIN_PASSWORD=""\nCUSTOMER_PASSWORD="mine"\n');
    expect(ensureEnvValue(root, 'ADMIN_PASSWORD', () => 'pw$1')).toBe('added');
    expect(ensureEnvValue(root, 'CUSTOMER_PASSWORD', () => 'other')).toBe('exists');
    expect(env()).toBe('ADMIN_PASSWORD="pw$1"\nCUSTOMER_PASSWORD="mine"\n');
  });

  it('makes a 24-character URL-safe password, different every time', () => {
    const password = newPassword();
    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newPassword()).not.toBe(password);
  });
});

describe('newIdentityKey (D95)', () => {
  it('makes a 32-byte key, different every time', () => {
    const key = newIdentityKey();
    expect(Buffer.from(key, 'base64url')).toHaveLength(32);
    expect(newIdentityKey()).not.toBe(key);
  });
});
