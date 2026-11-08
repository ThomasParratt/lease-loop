// Password hashing (D91): scrypt from node:crypto, memory-hard, no new dependency. Stored as
// `scrypt$N$r$p$salt$hash` (base64), a fresh 16-byte salt per hash. Passwords are NFC-normalised
// first, so the same text typed on another keyboard matches. Comparison is constant time. A
// stored value that cannot be read, or asks for more work than the cap, never verifies.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const COST = { N: 32_768, r: 8, p: 1 };
const MAX_N = 1 << 17;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
// scrypt needs about 128 × N × r bytes; this leaves room for N up to the cap.
const MAX_MEMORY = 256 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFC'),
      salt,
      KEY_BYTES,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

/** A new stored hash of `password`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join(
    '$'
  );
}

type Parsed = { N: number; r: number; p: number; salt: Buffer; key: Buffer };

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
  if (!N || !r || !p || N > MAX_N || r > 16 || p > 4) return null;
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const key = Buffer.from(parts[5] ?? '', 'base64');
  if (salt.length === 0 || key.length !== KEY_BYTES) return null;
  return { N, r, p, salt, key };
}

let dummy: Promise<string> | undefined;

/** Whether `password` matches `stored`. Unreadable stored values do the dummy work and fail. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return burnPasswordCheck(password);
  const { salt, key, ...options } = parsed;
  try {
    const candidate = await derive(password, salt, options);
    return timingSafeEqual(candidate, key);
  } catch {
    return false;
  }
}

/**
 * The same scrypt work as a real check, against a throwaway hash, always false: used for an
 * unknown e-mail or a locked account, so the answer's timing does not say which it was.
 */
export async function burnPasswordCheck(password: string): Promise<false> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  const parsed = parse(await dummy);
  if (parsed) await derive(password, parsed.salt, COST);
  return false;
}
