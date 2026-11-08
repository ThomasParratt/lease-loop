// Fills the database from the data pack. Run by `npm run db:setup` (via `prisma db seed`).
// Safe to run again: it only adds assets, customers, company signatories and sign-in accounts
// that are missing, and never overwrites your changes. The signatories are valid from the seed day (D46).
import { loadAssets, loadCustomers } from '@/data/load';
import { seedAccounts } from '@/server/accounts';
import { seedAssets } from '@/server/assets';
import { seedCustomers } from '@/server/customers';
import { createPrismaClient } from '@/server/prisma-client';
import { seedSignatories } from '@/server/signatories';
import { todayIso } from '@/server/today';

const db = createPrismaClient();
try {
  const assets = await seedAssets(db, await loadAssets());
  console.log(`🌱 Seeded ${assets.created} new assets (${assets.skipped} were already there).`);
  const pack = await loadCustomers();
  const customers = await seedCustomers(db, pack);
  console.log(
    `🌱 Seeded ${customers.created} new customers (${customers.skipped} were already there).`
  );
  const signatories = await seedSignatories(db, pack, todayIso());
  console.log(
    `🌱 Seeded ${signatories.created} new company signatories (${signatories.skipped} companies had theirs).`
  );
  // D92: the passwords come from .env (scripts/ensure-env.mjs fills them), never from the repo.
  const accounts = await seedAccounts(db, pack, {
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    customerPassword: process.env.CUSTOMER_PASSWORD,
  });
  console.log(
    `🌱 Seeded ${accounts.created} new sign-in accounts (${accounts.skipped} were already there).`
  );
  for (const problem of accounts.problems) console.warn(`⚠ No account added: ${problem}`);
} finally {
  await db.$disconnect();
}
