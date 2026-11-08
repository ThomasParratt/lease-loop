// Accounts (D92): one per customer of the data pack, on its record's e-mail, and the admin's.
// The role and the customer come from the row, never from the sign-in form. The seed adds the
// missing accounts with the passwords from .env (`ADMIN_PASSWORD`, `CUSTOMER_PASSWORD`);
// nothing secret is in the repo. The auth slice owns `Account` (and `Session`).
import { checkNewPassword, normaliseEmail } from '@/domain/auth/credentials';
import type { Account } from '@/generated/prisma/client';
import { hashPassword } from './passwords';
import type { PrismaClient } from './prisma-client';

export type { Account };

/** The actor an account signs in as: `admin`, its customer id, or null for a broken row. */
export function accountActor(account: Pick<Account, 'role' | 'customer_id'>): string | null {
  if (account.role === 'admin') return 'admin';
  if (account.role === 'customer') return account.customer_id;
  return null;
}

/** The account with this e-mail (compared trimmed and in lower case), or null. */
export async function findAccountByEmail(db: PrismaClient, email: string): Promise<Account | null> {
  return db.account.findUnique({ where: { email: normaliseEmail(email) } });
}

export type AccountSeed = {
  adminEmail?: string;
  adminPassword?: string;
  customerPassword?: string;
};

export type AccountSeedResult = { created: number; skipped: number; problems: string[] };

/**
 * Adds the accounts that are missing: the admin's, and one per customer on its e-mail. Never
 * changes an existing account. A password that is missing or too weak skips its accounts and
 * says why in `problems`.
 */
export async function seedAccounts(
  db: PrismaClient,
  customers: readonly { id: string; email: string }[],
  seed: AccountSeed
): Promise<AccountSeedResult> {
  const problems: string[] = [];
  const usable = (name: string, password: string | undefined): password is string => {
    if (!password) {
      problems.push(`${name} is not set in .env`);
      return false;
    }
    const check = checkNewPassword(password);
    if (!check.ok) problems.push(`${name}: ${check.reason.code}`);
    return check.ok;
  };
  const existing = await db.account.findMany({
    select: { email: true, customer_id: true, role: true },
  });
  const emails = new Set(existing.map((row) => row.email));
  const customerIds = new Set(existing.map((row) => row.customer_id));
  let created = 0;
  let skipped = 0;

  const adminEmail = normaliseEmail(seed.adminEmail ?? '');
  if (existing.some((row) => row.role === 'admin')) skipped += 1;
  else if (adminEmail === '') problems.push('ADMIN_EMAIL is not set in .env');
  else if (usable('ADMIN_PASSWORD', seed.adminPassword)) {
    await db.account.create({
      data: {
        email: adminEmail,
        role: 'admin',
        password_hash: await hashPassword(seed.adminPassword),
      },
    });
    emails.add(adminEmail);
    created += 1;
  }

  const missing = customers.filter((customer) => !customerIds.has(customer.id));
  skipped += customers.length - missing.length;
  if (missing.length > 0 && usable('CUSTOMER_PASSWORD', seed.customerPassword)) {
    for (const customer of missing) {
      const email = normaliseEmail(customer.email);
      if (emails.has(email)) {
        problems.push(`${customer.id}: ${email} already has an account`);
        continue;
      }
      await db.account.create({
        data: {
          email,
          role: 'customer',
          customer_id: customer.id,
          password_hash: await hashPassword(seed.customerPassword),
        },
      });
      emails.add(email);
      created += 1;
    }
  }
  return { created, skipped, problems };
}
