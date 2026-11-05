// Audit trail: every change to business data writes an AuditLog row in the SAME database
// transaction as the change. If either write fails, both are rolled back, so the database
// can never hold a change that nobody can explain.
//
// The rows form a hash chain (docs/features/audit-chain.md, D36): each row stores the hash of
// the row before it and its own hash over that plus its canonical content, so an edit, a
// deletion or a reordering made outside the app shows up in verifyAuditChain. Tamper-evident,
// not tamper-proof: the head hash is the anchor a person copies out of the database.
import {
  GENESIS_HASH,
  hashAuditEntry,
  verifyAuditChain as verifyChainRows,
  type AuditChainVerdict,
} from '@/domain/audit';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { auditEntrySchema } from '@/domain/rows/audit-entry';
import { parseRow } from './row-rules';

export type AuditEntry = {
  /** Who did it (a user id or name; there is no login in the starter). */
  actor: string;
  /** What happened, as `<entity>.<verb>`, e.g. `asset.status_changed`. */
  action: string;
  entityType: string;
  entityId: string;
  /** Anything useful for a later reader, e.g. `{ from: 'available', to: 'reserved' }`. Stored as JSON. */
  details?: unknown;
};

export type TransactionClient = Prisma.TransactionClient;

/**
 * Runs `work` inside a transaction and records `entry` in the audit log.
 * Use the `tx` you are given for every write in `work`; writes through `db` would
 * escape the transaction.
 *
 *   const asset = await withAudit(db, { actor, action: 'asset.status_changed', ... },
 *     (tx) => tx.asset.update({ where: { id }, data: { status } }));
 */
export async function withAudit<T>(
  db: PrismaClient,
  entry: AuditEntry,
  work: (tx: TransactionClient) => Promise<T>,
  /** The row's instant (ISO); the server clock, read once here, when not given. */
  now: string = new Date().toISOString()
): Promise<T> {
  // Checked before the change runs: an entry that cannot be written must not cost the work.
  parseRow('audit entry', auditEntrySchema, entry);
  // Normalised to the millisecond ISO form the database gives back, so the hash re-verifies.
  const createdAt = new Date(now).toISOString();
  return db.$transaction(async (tx) => {
    const result = await work(tx);
    // SQLite serialises writers, so no other transaction can chain to the same previous row
    // between this read and the insert; the unique prev_hash column is the second guard (two
    // rows can never chain to the same row). On
    // Postgres this read needs SELECT … FOR UPDATE or an advisory lock.
    const previous = await tx.auditLog.findFirst({
      orderBy: { id: 'desc' },
      select: { hash: true },
    });
    const prevHash = previous?.hash ?? GENESIS_HASH;
    const detailsJson = entry.details === undefined ? null : JSON.stringify(entry.details);
    const hash = hashAuditEntry(prevHash, {
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // Hashed as stored: what JSON.parse gives back from details_json.
      details: detailsJson === null ? null : JSON.parse(detailsJson),
      createdAt,
    });
    await tx.auditLog.create({
      data: {
        created_at: new Date(createdAt),
        actor: entry.actor,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        details_json: detailsJson,
        prev_hash: prevHash,
        hash,
      },
    });
    return result;
  });
}

export type AuditLogEntry = {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: unknown;
};

/** The newest audit rows first. */
export async function listAuditLog(db: PrismaClient, limit = 50): Promise<AuditLogEntry[]> {
  const rows = await db.auditLog.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at.toISOString(),
    actor: row.actor,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details: row.details_json === null ? null : parseStoredJson(row.details_json),
  }));
}

/** Walks the whole audit log in id order and names the first broken row (see domain/audit). */
export async function verifyAuditChain(db: PrismaClient): Promise<AuditChainVerdict> {
  const rows = await db.auditLog.findMany({ orderBy: { id: 'asc' } });
  return verifyChainRows(
    rows.map((row) => ({
      id: row.id,
      prevHash: row.prev_hash,
      hash: row.hash,
      actor: row.actor,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details_json === null ? null : parseStoredJson(row.details_json),
      createdAt: row.created_at.toISOString(),
    }))
  );
}

/** The newest row's hash, or the genesis hash for an empty log. */
export async function auditChainHead(db: PrismaClient): Promise<string> {
  const newest = await db.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  return newest?.hash ?? GENESIS_HASH;
}

/** details_json as parsed, or the raw text when someone stored text that is not JSON. */
function parseStoredJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
