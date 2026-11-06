// Reading and changing assets in the database. Rows are converted to the same `Asset`
// shape as data/assets.json, so the UI and domain code see one type everywhere.
import type { Asset as AssetRow, PrismaClient } from '@/generated/prisma/client';
import {
  assetSchema,
  assetStatusSchema,
  type Asset,
  type AssetCategory,
  type AssetStatus,
} from '@/data/schemas';
import {
  checkAssetStatusChange,
  type AssetStatusChangeRefusal,
} from '@/domain/catalogue/transitions';
import { ADMIN_ACTOR } from './actor';
import { withAudit, type TransactionClient } from './audit';

/** Database row → data-pack shape. Validates, so a bad value edited in by hand is caught. */
export function toAsset(row: AssetRow): Asset {
  return assetSchema.parse({
    id: row.id,
    category: row.category,
    make: row.make,
    model: row.model,
    model_year: row.model_year,
    serial_number: row.serial_number,
    condition: row.condition,
    usage: { unit: row.usage_unit, value: row.usage_value },
    previous_lives: row.previous_lives,
    status: row.status,
  });
}

/** Data-pack shape → columns for a new database row. */
export function toAssetRowData(asset: Asset) {
  return {
    id: asset.id,
    category: asset.category,
    make: asset.make,
    model: asset.model,
    model_year: asset.model_year,
    serial_number: asset.serial_number,
    condition: asset.condition,
    usage_unit: asset.usage.unit,
    usage_value: asset.usage.value,
    previous_lives: asset.previous_lives,
    status: asset.status,
  };
}

export async function listAssets(
  db: PrismaClient | TransactionClient,
  filter: { category?: AssetCategory } = {}
): Promise<Asset[]> {
  const rows = await db.asset.findMany({
    where: filter.category ? { category: filter.category } : {},
    orderBy: { id: 'asc' },
  });
  return rows.map(toAsset);
}

/** One asset by id, or null. The read other slices use for a single asset (team rule 3). */
export async function getAsset(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<Asset | null> {
  const row = await db.asset.findUnique({ where: { id } });
  return row ? toAsset(row) : null;
}

export type ChangeAssetStatusResult =
  | { ok: true; asset: Asset }
  | { ok: false; reason: 'not_found' | 'admin_only' }
  | { ok: false; reason: AssetStatusChangeRefusal };

/** Thrown inside the transaction when another request changed the status first. */
class LostStatusRace extends Error {}

/**
 * The admin's manual status change (`PATCH /api/assets/:id/status`). Only `admin` may make
 * it; the actor comes from the server's actor cookie, never from the body. The change must be
 * one of D22's transitions (`checkAssetStatusChange`, parsed before any write); a refusal is a
 * code with both statuses. The status and `asset.status_changed` are written in one
 * transaction, and the update only applies while the status is still the one checked, so a
 * concurrent change makes this one a refusal, not a skipped transition.
 */
export async function changeAssetStatus(
  db: PrismaClient,
  input: { id: string; status: AssetStatus; actor: string }
): Promise<ChangeAssetStatusResult> {
  const status = assetStatusSchema.parse(input.status);
  if (input.actor !== ADMIN_ACTOR) return { ok: false, reason: 'admin_only' };
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };
  const check = checkAssetStatusChange(existing.status, status);
  if (!check.ok) return { ok: false, reason: check.reason };

  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.status_changed',
        entityType: 'asset',
        entityId: input.id,
        details: { from: existing.status, to: status },
      },
      async (tx) => {
        const { count } = await tx.asset.updateMany({
          where: { id: input.id, status: existing.status },
          data: { status },
        });
        if (count === 0) throw new LostStatusRace();
        return tx.asset.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
    return { ok: true, asset: toAsset(updated) };
  } catch (error) {
    if (!(error instanceof LostStatusRace)) throw error;
    // Another change won: report the status it left, so the admin sees why.
    const now = await db.asset.findUniqueOrThrow({ where: { id: input.id } });
    const from = assetStatusSchema.parse(now.status);
    return { ok: false, reason: { code: 'transition_not_allowed', params: { from, to: status } } };
  }
}

/** Inserts assets that are not in the database yet. Never overwrites changes you made. */
export async function seedAssets(
  db: PrismaClient,
  assets: readonly Asset[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.asset.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = assets.filter((asset) => !existingIds.has(asset.id));
  if (missing.length > 0) {
    await db.asset.createMany({ data: missing.map(toAssetRowData) });
  }
  return { created: missing.length, skipped: assets.length - missing.length };
}
