// The catalogue's part of a signing (D22: CONTRACT_SIGNED sets the asset `leased`). It is a
// conditional write: only a row still `available` changes. That write is the last-unit race:
// when two signings for the same asset meet, the second finds no available row, this throws
// and the second signing rolls back whole (contract, invoices, passport, audit).
//
// The signing calls it on its own `tx` before it emits, instead of registering it on the bus:
// the invoices and passport tests emit CONTRACT_SIGNED for the same asset several times, and
// a lost race should stop before the other handlers write (docs/features/contracts.md).
import { assetStatusSchema } from '@/data/schemas';
import type { TransactionClient } from './audit';

/** Thrown inside the signing transaction when the asset was taken first. */
export class AssetNotAvailableError extends Error {
  constructor(readonly assetId: string) {
    super(`Asset ${assetId} is no longer available`);
    this.name = 'AssetNotAvailableError';
  }
}

/** Sets the asset `leased` if, and only if, it is still `available`; else throws. */
export async function leaseAvailableAsset(tx: TransactionClient, assetId: string): Promise<void> {
  // D23: the values are parsed before the write.
  const from = assetStatusSchema.parse('available');
  const to = assetStatusSchema.parse('leased');
  const { count } = await tx.asset.updateMany({
    where: { id: assetId, status: from },
    data: { status: to },
  });
  if (count !== 1) throw new AssetNotAvailableError(assetId);
}
