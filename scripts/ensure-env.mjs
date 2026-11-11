// Creates .env from .env.example when .env is missing, then makes sure it holds the audit
// log's signing key (D81), the identity key (D95) and the seed's sign-in passwords (D92): a fresh Ed25519 key and
// random passwords, generated here and written only to .env, which git ignores. Never
// overwrites an existing .env value; never prints a password.
// Usage: node scripts/ensure-env.mjs
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} root folder that holds .env.example
 * @returns {'created' | 'exists'}
 */
export function ensureEnvFile(root) {
  const target = join(root, '.env');
  if (existsSync(target)) return 'exists';
  copyFileSync(join(root, '.env.example'), target);
  return 'created';
}

/** A new Ed25519 private key as base64 PKCS#8 DER, the form AUDIT_SIGNING_KEY takes. */
export function newSigningKey() {
  return generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64');
}

/** A random 24-character password for the seeded accounts (D92), 144 bits. */
export function newPassword() {
  return randomBytes(18).toString('base64url');
}

/**
 * Fills an empty `NAME=""` line of `root/.env`, or appends one, with `make()`. A value already
 * there is kept.
 * @param {string} root folder that holds .env
 * @param {string} name
 * @param {() => string} make
 * @returns {'added' | 'exists'}
 */
export function ensureEnvValue(root, name, make) {
  const target = join(root, '.env');
  const text = readFileSync(target, 'utf8');
  const pattern = new RegExp(`^${name}=(.*)$`, 'm');
  const match = pattern.exec(text);
  if (match && match[1].replace(/["'\s]/g, '') !== '') return 'exists';
  const line = `${name}="${make()}"`;
  const next = match
    ? text.replace(pattern, () => line)
    : `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`;
  writeFileSync(target, next);
  return 'added';
}

/**
 * Fills an empty `AUDIT_SIGNING_KEY=""` line of `root/.env`, or appends one, with a new key.
 * A key already there is kept: a new key would make every signed row read as forged.
 * @param {string} root folder that holds .env
 * @param {() => string} [makeKey]
 * @returns {'added' | 'exists'}
 */
export function ensureSigningKey(root, makeKey = newSigningKey) {
  return ensureEnvValue(root, 'AUDIT_SIGNING_KEY', makeKey);
}

/** The .env passwords the seed signs accounts in with (D92). */
export const PASSWORD_NAMES = ['ADMIN_PASSWORD', 'CUSTOMER_PASSWORD'];
/** A new key for the identity HMAC (D95): 32 random bytes, base64url. */
export function newIdentityKey() {
  return randomBytes(32).toString('base64url');
}

/** The admin's sign-in e-mail when .env names none (`.example` is a reserved domain). */
export const DEFAULT_ADMIN_EMAIL = 'admin@lease-loop.example';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = ensureEnvFile(process.cwd());
  console.log(result === 'created' ? '📝 Created .env from .env.example' : '✔ .env already exists');
  if (ensureSigningKey(process.cwd()) === 'added') {
    console.log('🔑 Added a new AUDIT_SIGNING_KEY to .env (never commit it)');
  }
  ensureEnvValue(process.cwd(), 'ADMIN_EMAIL', () => DEFAULT_ADMIN_EMAIL);
  if (ensureEnvValue(process.cwd(), 'IDENTITY_HASH_KEY', newIdentityKey) === 'added') {
    console.log(
      '🔑 Added a new IDENTITY_HASH_KEY to .env: it links accounts to bank identities (D95)'
    );
  }
  for (const name of PASSWORD_NAMES) {
    if (ensureEnvValue(process.cwd(), name, newPassword) === 'added') {
      console.log(`🔑 Added a random ${name} to .env: the seed signs accounts in with it (D92)`);
    }
  }
}
