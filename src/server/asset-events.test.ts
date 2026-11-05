// The asset event log on a real, migrated SQLite database: validation, the order of the log
// and the passport and impact read on top of it (card 10).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContractFixture } from '../../tests/helpers/contract-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { appendAssetEvent, listAssetEvents, readFleetImpact, readPassport } from './asset-events';
import { withAudit, type AuditEntry } from './audit';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await createContractFixture(db, {
    assetId: 'ebike-008',
    contractId: 'c-third',
    previousLives: 2,
  });
  await createContractFixture(db, { assetId: 'ebike-009', contractId: 'c-other' });
});
afterAll(async () => {
  await cleanup();
});

const entry: AuditEntry = {
  actor: 'team-test',
  action: 'asset.event_logged',
  entityType: 'asset',
  entityId: 'ebike-008',
};

describe('appendAssetEvent and listAssetEvents', () => {
  it('refuses an unknown kind and writes nothing', async () => {
    await expect(
      withAudit(db, entry, (tx) =>
        appendAssetEvent(tx, {
          assetId: 'ebike-009',
          // @ts-expect-error: not a kind
          kind: 'stolen',
          onDate: '2026-11-06',
        })
      )
    ).rejects.toThrow();
    expect(await listAssetEvents(db, 'ebike-009')).toEqual([]);
  });

  it('refuses a day that is not a real ISO day', async () => {
    await expect(
      withAudit(db, entry, (tx) =>
        appendAssetEvent(tx, { assetId: 'ebike-009', kind: 'assessed', onDate: '2026-02-30' })
      )
    ).rejects.toThrow();
  });

  it('lists the events in log order, two on one day kept as written', async () => {
    await withAudit(db, entry, async (tx) => {
      await appendAssetEvent(tx, {
        assetId: 'ebike-008',
        kind: 'assessed',
        onDate: '2026-11-06',
        details: { grade: 'good' },
      });
      await appendAssetEvent(tx, {
        assetId: 'ebike-008',
        contractId: 'c-third',
        kind: 'leased',
        onDate: '2026-11-06',
      });
    });
    const events = await listAssetEvents(db, 'ebike-008');
    expect(events.map((e) => [e.kind, e.on_date, e.contract_id])).toEqual([
      ['assessed', '2026-11-06', null],
      ['leased', '2026-11-06', 'c-third'],
    ]);
    expect(events[0]!.details).toEqual({ grade: 'good' });
    expect(events[0]!.id).toBeLessThan(events[1]!.id);
  });
});

describe('readPassport', () => {
  it('card 10: ebike-008 has two past lives and its third, 58 kg saved after 24 months', async () => {
    const result = await readPassport(db, 'ebike-008', '2028-11-05');
    expect(result?.passport.lives.map((life) => [life.estimated, life.months])).toEqual([
      [true, 24],
      [true, 24],
      [false, 24],
    ]);
    // The assessment ahead of the third lease sits in the gap after the past lives.
    expect(result?.passport.lives[1]!.between.map((e) => e.kind)).toEqual(['assessed']);
    expect(result?.co2.perLifeKg).toEqual([0, 29, 29]);
    expect(result?.co2.totalKg).toBe(58);
  });

  it('on the signing day the third life has earned nothing yet', async () => {
    const result = await readPassport(db, 'ebike-008', '2026-11-06');
    expect(result?.co2.totalKg).toBe(29);
  });

  it('an asset with no history has no lives and no saving', async () => {
    const result = await readPassport(db, 'ebike-009', '2026-11-06');
    expect(result?.passport.lives).toEqual([]);
    expect(result?.co2.totalKg).toBe(0);
  });

  it('an unknown asset is null', async () => {
    expect(await readPassport(db, 'nope', '2026-11-06')).toBeNull();
  });
});

describe('readFleetImpact', () => {
  it('totals the fleet from the past lives and the log', async () => {
    const { fleet, assets } = await readFleetImpact(db, '2028-11-05');
    expect(fleet.perCategory.find((row) => row.category === 'e_bike')).toEqual({
      category: 'e_bike',
      assetsWithLaterLife: 1,
      kg: 58,
    });
    expect(fleet.totalKg).toBe(58);
    expect(assets.map((item) => [item.asset.id, item.kg])).toEqual([['ebike-008', 58]]);
  });
});
