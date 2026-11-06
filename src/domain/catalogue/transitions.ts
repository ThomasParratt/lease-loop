// The asset status transitions of D22 (docs/decisions.md), as data. An item is held
// (`reserved`) or leased from `available`; a lease ends `returned` or `sold`; second life puts a
// returned item back to `available`; `sold` leaves the loop, so nothing goes out of it.
import { assetStatusSchema, type AssetStatus } from '@/data/schemas';

export const ASSET_STATUS_TRANSITIONS: Readonly<Record<AssetStatus, readonly AssetStatus[]>> = {
  available: ['reserved', 'leased'],
  reserved: ['available'],
  leased: ['returned', 'sold'],
  returned: ['available'],
  sold: [],
};

export type AssetStatusChangeRefusal = {
  code: 'transition_not_allowed';
  params: { from: AssetStatus; to: AssetStatus };
};

/**
 * Whether an asset may go from `from` to `to`. Both are parsed first (a value outside the list
 * throws); a change to the same status is refused, since there is nothing to change.
 */
export function checkAssetStatusChange(
  from: string,
  to: string
): { ok: true } | { ok: false; reason: AssetStatusChangeRefusal } {
  const current = assetStatusSchema.parse(from);
  const next = assetStatusSchema.parse(to);
  if (ASSET_STATUS_TRANSITIONS[current].includes(next)) return { ok: true };
  return {
    ok: false,
    reason: { code: 'transition_not_allowed', params: { from: current, to: next } },
  };
}
