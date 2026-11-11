// Strong identification, our side of it (D95, D96). `startIdentification` records a request and
// gives the browser a random `state` (kept in an HttpOnly cookie) and the broker a `nonce`;
// `completeIdentification` takes the broker's single-use code back, checks that the same
// browser brings the same state before the request expires, redeems the code, checks the
// nonce, and records who was identified: the HMAC of the code and the broker's name for them,
// never the code. A signing identification is then used once, in the signing transaction
// (`useIdentification`). The broker is the Test Bank for now (D97).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  checkCallback,
  identificationExpiry,
  identificationPurposeSchema,
  type CallbackRefusal,
  type IdentificationPurpose,
  type IdentificationRecord,
} from '@/domain/identity/identification';
import { withAudit, type TransactionClient } from './audit';
import { identityHash } from './identity-hash';
import type { PrismaClient } from './prisma-client';
import { SECURE_COOKIES } from './sessions';
import type { VerifiedPerson } from './test-bank';

export const IDENTIFICATION_COOKIE = SECURE_COOKIES
  ? '__Host-lease-loop-identification'
  : 'lease-loop-identification';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** `Set-Cookie` for the state of a request: ten minutes, this browser only, never to scripts. */
export function identificationCookieHeader(state: string | null): string {
  const secure = SECURE_COOKIES ? '; Secure' : '';
  return state === null
    ? `${IDENTIFICATION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
    : `${IDENTIFICATION_COOKIE}=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure}`;
}

export type IdentificationView = IdentificationRecord & {
  id: string;
  next: string;
  startedBy: string;
  personName: string | null;
  method: string | null;
  transactionId: string | null;
};

type Row = NonNullable<Awaited<ReturnType<PrismaClient['identification']['findUnique']>>>;

function toView(row: Row): IdentificationView {
  return {
    id: row.id,
    purpose: identificationPurposeSchema.parse(row.purpose),
    subject: row.subject,
    next: row.next,
    startedBy: row.started_by,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    usedAt: row.used_at,
    identityHash: row.identity_hash,
    personName: row.person_name,
    method: row.method,
    transactionId: row.transaction_id,
  };
}

/** Records a new request; `next` must already be a safe path of this site. */
export async function startIdentification(
  db: PrismaClient,
  input: {
    purpose: IdentificationPurpose;
    subject: string | null;
    next: string;
    actor: string;
    now: string;
  }
): Promise<{ id: string; state: string; nonce: string }> {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const id = `idn-${randomBytes(12).toString('hex')}`;
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'identification.started',
      entityType: 'identification',
      entityId: id,
      details: { purpose: input.purpose, subject: input.subject },
    },
    (tx) =>
      tx.identification.create({
        data: {
          id,
          state_hash: sha256(state),
          nonce,
          purpose: identificationPurposeSchema.parse(input.purpose),
          subject: input.subject,
          next: input.next,
          started_by: input.actor,
          expires_at: identificationExpiry(input.now),
        },
      }),
    input.now
  );
  return { id, state, nonce };
}

/** The identification with this id, or null. */
export async function findIdentification(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<IdentificationView | null> {
  const row = await db.identification.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

export type CompleteRefusal = CallbackRefusal | 'identification_failed';
export type CompleteResult =
  | { ok: true; identification: IdentificationView }
  | {
      ok: false;
      code: CompleteRefusal;
      next: string | null;
      purpose: IdentificationPurpose | null;
    };

/** Equal strings, compared in constant time over their hashes. */
function sameSecret(a: string | undefined, b: string): boolean {
  if (a === undefined) return false;
  return timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
}

/**
 * The broker sent the browser back with `state` and a single-use `code`. `cookieState` is
 * the state this browser kept; `redeem` asks the broker who the code identifies.
 */
export async function completeIdentification(
  db: PrismaClient,
  input: {
    state: string;
    cookieState: string | undefined;
    code: string | null;
    now: string;
    redeem: (code: string) => VerifiedPerson | null;
  }
): Promise<CompleteResult> {
  const row = await db.identification.findUnique({ where: { state_hash: sha256(input.state) } });
  const record = row ? toView(row) : null;
  const check = checkCallback(record, {
    sameBrowser: sameSecret(input.cookieState, input.state),
    now: input.now,
  });
  if (!check.ok) {
    return {
      ok: false,
      code: check.reason.code,
      next: record?.next ?? null,
      purpose: record?.purpose ?? null,
    };
  }
  const view = record!;
  const person = input.code ? input.redeem(input.code) : null;
  if (!person || !sameSecret(person.nonce, row!.nonce)) {
    return { ok: false, code: 'identification_failed', next: view.next, purpose: view.purpose };
  }
  const hash = identityHash(person.personalCode);
  const completed = await withAudit(
    db,
    {
      actor: view.startedBy,
      action: 'identification.completed',
      entityType: 'identification',
      entityId: view.id,
      details: {
        purpose: view.purpose,
        subject: view.subject,
        method: person.method,
        transactionId: person.transactionId,
      },
    },
    async (tx) => {
      const done = await tx.identification.updateMany({
        where: { id: view.id, completed_at: null },
        data: {
          completed_at: input.now,
          identity_hash: hash,
          person_name: person.name,
          method: person.method,
          transaction_id: person.transactionId,
        },
      });
      return done.count === 1;
    },
    input.now
  );
  if (!completed) {
    return {
      ok: false,
      code: 'identification_already_completed',
      next: view.next,
      purpose: view.purpose,
    };
  }
  return { ok: true, identification: (await findIdentification(db, view.id))! };
}

/** Thrown inside the signing transaction when the identification was used a moment ago. */
export class IdentificationUsedError extends Error {}

/** Marks a signing identification used at `now`, inside the caller's transaction (D96). */
export async function useIdentification(
  tx: TransactionClient,
  id: string,
  now: string
): Promise<void> {
  const used = await tx.identification.updateMany({
    where: { id, used_at: null },
    data: { used_at: now },
  });
  if (used.count !== 1) throw new IdentificationUsedError();
}
