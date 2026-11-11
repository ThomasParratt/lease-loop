// What the application page needs to offer signing to a person (D96): whether the applicant
// signs with a bank identification, and the identification the browser came back with when it
// still lets them sign (same application, same person, fresh, unused). Read-only.
import { checkForSigning, signsInWithBank } from '@/domain/identity/identification';
import { identityHashOfCustomer } from './accounts';
import { getCustomer } from './customers';
import { findIdentification } from './identifications';
import type { PrismaClient } from './prisma-client';

export type SigningIdentificationState = {
  needsIdentification: boolean;
  identification: { id: string; name: string } | null;
};

export async function signingIdentification(
  db: PrismaClient,
  customerId: string,
  applicationId: string,
  identificationId: unknown,
  now: string = new Date().toISOString()
): Promise<SigningIdentificationState> {
  const customer = await getCustomer(db, customerId);
  if (!customer || !signsInWithBank(customer.type)) {
    return { needsIdentification: false, identification: null };
  }
  if (typeof identificationId !== 'string' || identificationId.length > 100) {
    return { needsIdentification: true, identification: null };
  }
  const record = await findIdentification(db, identificationId);
  const check = checkForSigning(record, {
    applicationId,
    identityHash: await identityHashOfCustomer(db, customerId),
    now,
  });
  return {
    needsIdentification: true,
    identification: check.ok ? { id: record!.id, name: record!.personName ?? '' } : null,
  };
}
