// The tamper demo (docs/features/audit-chain.md): `npm run demo:tamper [-- --id <n>]`.
// Rewrites details_json of the newest audit row (or row <n>) straight in the SQLite file named
// by DATABASE_URL, the way someone with database access could, and prints the row and the
// chain's verdict before and after. Reload /en/audit to see the badge turn to "broken".
// A script a person runs in a terminal, never a route: the app itself never edits audit rows
// (tests/meta-rules.test.ts). `npm run db:reset` gives a clean chain again.
import { existsSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** `--id <n>` → n; nothing → null (the newest row). Throws on anything else. */
export function parseTamperArgs(argv) {
  if (argv.length === 0) return null;
  const id = Number(argv[1]);
  if (argv[0] !== '--id' || argv.length !== 2 || !Number.isInteger(id) || id < 1) {
    throw new Error('usage: npm run demo:tamper [-- --id <n>]');
  }
  return id;
}

/** The stored details with `tampered: true` added, as JSON text (null or non-JSON details too). */
export function tamperedDetails(detailsJson) {
  let details;
  try {
    details = detailsJson === null ? null : JSON.parse(detailsJson);
  } catch {
    details = { original: detailsJson };
  }
  const base = details !== null && typeof details === 'object' && !Array.isArray(details);
  return JSON.stringify(base ? { ...details, tampered: true } : { value: details, tampered: true });
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const id = parseTamperArgs(process.argv.slice(2));
  const { createPrismaClient } = await import('../src/server/prisma-client.ts');
  const { verifyAuditChain } = await import('../src/server/audit.ts');
  const db = createPrismaClient();
  try {
    const row = await db.auditLog.findFirst(
      id === null ? { orderBy: { id: 'desc' } } : { where: { id } }
    );
    if (!row) throw new Error(id === null ? 'the audit log is empty' : `no audit row #${id}`);
    const print = (label, value) => process.stdout.write(`${label} ${JSON.stringify(value)}\n`);

    print('row before:  ', { id: row.id, action: row.action, details_json: row.details_json });
    print('chain before:', await verifyAuditChain(db));
    const changed = tamperedDetails(row.details_json);
    // Raw SQL on purpose: this is the edit from outside the app that the chain must reveal.
    await db.$executeRaw`UPDATE "AuditLog" SET details_json = ${changed} WHERE id = ${row.id}`;
    print('row after:   ', { id: row.id, action: row.action, details_json: changed });
    print('chain after: ', await verifyAuditChain(db));
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
