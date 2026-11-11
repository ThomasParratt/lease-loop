// A completed bank identification for a test (D96): links the customer's account to a test
// identity and records an identification of them for `applicationId`, completed `completedAt`,
// as the Test Bank flow would. The flow itself is tested in src/app/api/identifications/.
import { randomUUID } from 'node:crypto';
import { identityHash } from '@/server/identity-hash';
import type { PrismaClient } from '@/server/prisma-client';

/** The identity link the helper gives `customerId`'s account. */
export const testIdentityHash = (customerId: string) => identityHash(`test-person-${customerId}`);

/** The id of a completed signing identification of `customerId` for `applicationId`. */
export async function identifiedToSign(
  db: PrismaClient,
  customerId: string,
  applicationId: string,
  completedAt: string = new Date().toISOString()
): Promise<string> {
  const hash = testIdentityHash(customerId);
  await db.account.updateMany({
    where: { customer_id: customerId },
    data: { identity_hash: hash },
  });
  const id = `idn-${randomUUID()}`;
  await db.identification.create({
    data: {
      id,
      state_hash: `test-${id}`,
      nonce: 'test',
      purpose: 'sign_contract',
      subject: applicationId,
      next: '/en',
      started_by: customerId,
      expires_at: new Date(Date.parse(completedAt) + 600_000).toISOString(),
      completed_at: completedAt,
      identity_hash: hash,
      person_name: customerId,
      method: 'test_bank',
      transaction_id: `test-tx-${id}`,
    },
  });
  return id;
}
