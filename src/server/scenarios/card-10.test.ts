// Card 10 on a real migrated database: ebike-008's passport and CO2 as the data pack seeds it
// (two past lives, "good", 9 800 km), and what a return at the end of a lease adds to a
// passport. Leasing ebike-008 a third time waits for the refurbishment step (wave 3): the pack
// has it `returned`, and a quote needs `available`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { payRents, signedContract } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { listAssetEvents, readPassport } from '../asset-events';
import { getAsset } from '../assets';
import { verifyAuditChain } from '../audit';
import { getContract } from '../contracts';
import { exitContract } from '../exits';
import type { PrismaClient } from '../prisma-client';
import { createQuote } from '../quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

describe('card 10: ebike-008, two lives, good, 9 800 km', () => {
  it('the seeded passport has both past lives, estimated, and 29 kg avoided by the second', async () => {
    const asset = await getAsset(db, 'ebike-008');
    expect(asset).toMatchObject({ status: 'returned', condition: 'good', previous_lives: 2 });
    const read = await readPassport(db, 'ebike-008', '2026-11-05');
    expect(read?.passport.lives.map((l) => [l.months, l.estimated])).toEqual([
      [24, true],
      [24, true],
    ]);
    expect(read?.co2.perLifeKg).toEqual([0, 29]);
    expect(read?.co2.totalKg).toBe(29);
  });

  it('a returned item is not quoted until it is made available again', async () => {
    const quote = await createQuote(db, {
      assetId: 'ebike-008',
      termMonths: 24,
      downPaymentCents: 0,
      quantity: 1,
      today: '2026-11-05',
      actor: 'cust-aino',
    });
    expect(quote).toEqual({
      ok: false,
      reason: { code: 'asset_not_available', params: { assetId: 'ebike-008', status: 'returned' } },
    });
  });

  it.todo(
    'ebike-008 is leased a third time after its refurbishment (wave 3: returned → available)'
  );
});

describe('the passport after a return at the end of the lease', () => {
  it('card 1 run to its end and given back: a dated, counted life ending in returned', async () => {
    const aino = 'cust-aino';
    const card1 = { customerId: aino, assetId: 'ebike-003', termMonths: 36, quoteOn: '2026-11-05' };
    const { contract } = await signedContract(db, card1);
    await payRents(db, contract.id, 36, aino);

    const returned = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'return',
        reported: { condition: 'good', usage: { unit: 'km', value: 9_000 } },
        actor: aino,
      },
      contract.endDate
    );
    if (!returned.ok) throw new Error(returned.reason.code);
    expect((await getContract(db, contract.id))?.status).not.toBe('active');
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('returned');
    expect((await listAssetEvents(db, 'ebike-003')).map((e) => e.kind)).toEqual([
      'leased',
      'returned',
    ]);
    const read = await readPassport(db, 'ebike-003', contract.endDate);
    expect(read?.passport.lives.at(-1)).toMatchObject({
      start: '2026-11-05',
      estimated: false,
      endKind: 'returned',
      months: 36,
    });
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });
});
