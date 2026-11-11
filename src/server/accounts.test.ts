// D92: one account per customer on its record's e-mail, and the admin's; passwords from .env,
// never in the repo; a missing or weak password adds no account and says why.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { accountActor, findAccountByEmail, seedAccounts } from './accounts';
import type { PrismaClient } from './prisma-client';
import { verifyPassword } from './passwords';

const SEED = {
  adminEmail: 'Admin@Lease-Loop.test',
  adminPassword: 'admin-password-for-tests',
  customerPassword: 'customer-password-for-tests',
  identityOf: (customerId: string) => `identity-of-${customerId}`,
};

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = (await loadCustomers()).filter((c) =>
    ['cust-aino', 'cust-mikko', 'cust-kettukoodi'].includes(c.id)
  );
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});

describe('seedAccounts', { timeout: 30_000 }, () => {
  it('adds the admin with a password, people linked to an identity with none, companies with one', async () => {
    expect(await seedAccounts(db, customers, SEED)).toEqual({
      created: 4,
      skipped: 0,
      linked: 0,
      problems: [],
    });
    const admin = await findAccountByEmail(db, 'admin@lease-loop.test');
    expect(admin).toMatchObject({ role: 'admin', customer_id: null, identity_hash: null });
    expect(await verifyPassword(SEED.adminPassword, admin!.password_hash!)).toBe(true);
    const aino = await findAccountByEmail(db, 'AINO.VIRTANEN@example.com');
    expect(aino).toMatchObject({
      role: 'customer',
      customer_id: 'cust-aino',
      password_hash: null,
      identity_hash: 'identity-of-cust-aino',
      customer: { type: 'consumer' },
    });
    const kettu = await findAccountByEmail(db, 'it@kettukoodi.example.com');
    expect(kettu).toMatchObject({ identity_hash: null, customer: { type: 'company' } });
    expect(await verifyPassword(SEED.customerPassword, kettu!.password_hash!)).toBe(true);
  });

  it('adds only what is missing; it changes an account only to fill a missing identity link', async () => {
    // Aino's account as the password seed of D92 left it: a password, no identity link.
    await db.account.create({
      data: {
        email: 'aino.virtanen@example.com',
        role: 'customer',
        customer_id: 'cust-aino',
        password_hash: 'old-hash',
      },
    });
    expect(await seedAccounts(db, customers, SEED)).toMatchObject({ created: 3, linked: 1 });
    const before = await db.account.findMany({ orderBy: { email: 'asc' } });
    expect(before.find((a) => a.customer_id === 'cust-aino')).toMatchObject({
      password_hash: 'old-hash',
      identity_hash: 'identity-of-cust-aino',
    });
    expect(
      await seedAccounts(db, customers, { ...SEED, customerPassword: 'another-password-x' })
    ).toEqual({ created: 0, skipped: 4, linked: 0, problems: [] });
    expect(await db.account.findMany({ orderBy: { email: 'asc' } })).toEqual(before);
  });

  it('adds nothing for a missing or short password or a missing identity, and says why', async () => {
    const result = await seedAccounts(db, customers, {
      adminEmail: 'admin@lease-loop.test',
      adminPassword: 'short',
    });
    expect(result).toEqual({
      created: 0,
      skipped: 0,
      linked: 0,
      problems: [
        'ADMIN_PASSWORD: password_too_short',
        'CUSTOMER_PASSWORD is not set in .env',
        'cust-aino: no identity to link (IDENTITY_HASH_KEY)',
        'cust-mikko: no identity to link (IDENTITY_HASH_KEY)',
      ],
    });
    expect(await db.account.count()).toBe(0);
  });
});

describe('accountActor', () => {
  it('is admin, the customer id, or null for a row it cannot read', () => {
    expect(accountActor({ role: 'admin', customer_id: null })).toBe('admin');
    expect(accountActor({ role: 'customer', customer_id: 'cust-aino' })).toBe('cust-aino');
    expect(accountActor({ role: 'customer', customer_id: null })).toBeNull();
    expect(accountActor({ role: 'root', customer_id: 'cust-aino' })).toBeNull();
  });
});
