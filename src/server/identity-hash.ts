// The account's link to a verified person (D95): an HMAC-SHA256 of the personal identity code
// with `IDENTITY_HASH_KEY` from .env (scripts/ensure-env.mjs generates it). A plain hash would
// not do: there are only a few billion codes, quick to try. Without the key nothing is hashed
// (fail closed), so no account is linked and nobody signs in by bank.
import { createHmac } from 'node:crypto';

export const IDENTITY_KEY_ENV = 'IDENTITY_HASH_KEY';

export class MissingIdentityKeyError extends Error {
  constructor() {
    super(`${IDENTITY_KEY_ENV} is not set. Run \`npm run db:setup\` to add one to .env.`);
    this.name = 'MissingIdentityKeyError';
  }
}

/** The stored link for `personalCode`; throws when the key is missing or too short. */
export function identityHash(
  personalCode: string,
  env: Record<string, string | undefined> = process.env
): string {
  const key = env[IDENTITY_KEY_ENV];
  if (!key || key.length < 32) throw new MissingIdentityKeyError();
  return createHmac('sha256', key).update(`lease-loop/identity\n${personalCode}`).digest('hex');
}
