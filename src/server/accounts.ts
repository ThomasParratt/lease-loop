// Accounts (D92, D95): one per customer of the data pack, on its record's e-mail, and the
// admin's. The role and the customer come from the row, never from the sign-in form. A person
// (consumer, sole trader) has no password: the account is linked to the verified person by an
// HMAC of the identity code. The admin and the companies sign in with the passwords from .env
// (`ADMIN_PASSWORD`, `CUSTOMER_PASSWORD`); nothing secret is in the repo.
import { checkNewPassword, normaliseEmail } from '@/domain/auth/credentials';
import { signsInWithBank } from '@/domain/identity/identification';
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

export type AccountWithType = Account & { customer: { type: string } | null };

/** The account with this e-mail (compared trimmed and in lower case), with its customer's type. */
export async function findAccountByEmail(
  db: PrismaClient,
  email: string
): Promise<AccountWithType | null> {
  return db.account.findUnique({
    where: { email: normaliseEmail(email) },
    include: { customer: { select: { type: true } } },
  });
}

/** The account linked to a verified person (D95), with its customer's type, or null. */
export async function findAccountByIdentity(
  db: PrismaClient,
  identityHash: string
): Promise<AccountWithType | null> {
  return db.account.findUnique({
    where: { identity_hash: identityHash },
    include: { customer: { select: { type: true } } },
  });
}

/** The identity link of a customer's account (D96), or null when it has none. */
export async function identityHashOfCustomer(
  db: PrismaClient,
  customerId: string
): Promise<string | null> {
  const account = await db.account.findUnique({
    where: { customer_id: customerId },
    select: { identity_hash: true },
  });
  return account?.identity_hash ?? null;
}

export type AccountSeed = {
  adminEmail?: string;
  adminPassword?: string;
  /** The password of the company accounts. */
  customerPassword?: string;
  /** The identity link of a person's account (an HMAC), or null when there is none (D95). */
  identityOf?: (customerId: string) => string | null;
};

export type AccountSeedResult = {
  created: number;
  skipped: number;
  /** Existing person accounts that got their missing identity link. */
  linked: number;
  problems: string[];
};

/**
 * Adds the accounts that are missing: the admin's, and one per customer on its e-mail. A person
 * gets an identity link and no password; a company gets the company password. It never changes
 * an existing account, except to fill a person's missing identity link. A password or a link
 * that is missing or too weak skips its accounts and says why in `problems`.
 */
export async function seedAccounts(
  db: PrismaClient,
  customers: readonly { id: string; email: string; type: string }[],
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
    select: { id: true, email: true, customer_id: true, role: true, identity_hash: true },
  });
  const emails = new Set(existing.map((row) => row.email));
  const byCustomer = new Map(existing.map((row) => [row.customer_id, row]));
  const result: AccountSeedResult = { created: 0, skipped: 0, linked: 0, problems };

  const adminEmail = normaliseEmail(seed.adminEmail ?? '');
  if (existing.some((row) => row.role === 'admin')) result.skipped += 1;
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
    result.created += 1;
  }

  const companies = customers.filter((c) => !signsInWithBank(c.type) && !byCustomer.has(c.id));
  const companyPassword =
    companies.length > 0 && usable('CUSTOMER_PASSWORD', seed.customerPassword)
      ? seed.customerPassword
      : null;
  for (const customer of customers) {
    const email = normaliseEmail(customer.email);
    const person = signsInWithBank(customer.type);
    const identity = person ? (seed.identityOf?.(customer.id) ?? null) : null;
    const known = byCustomer.get(customer.id);
    if (known) {
      result.skipped += 1;
      if (person && identity !== null && known.identity_hash === null) {
        await db.account.update({ where: { id: known.id }, data: { identity_hash: identity } });
        result.linked += 1;
      }
      continue;
    }
    if (emails.has(email)) {
      problems.push(`${customer.id}: ${email} already has an account`);
      continue;
    }
    if (person && identity === null) {
      problems.push(`${customer.id}: no identity to link (IDENTITY_HASH_KEY)`);
      continue;
    }
    if (!person && companyPassword === null) continue;
    await db.account.create({
      data: {
        email,
        role: 'customer',
        customer_id: customer.id,
        password_hash: person ? null : await hashPassword(companyPassword!),
        identity_hash: identity,
      },
    });
    emails.add(email);
    result.created += 1;
  }
  return result;
}
