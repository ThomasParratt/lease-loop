// D93: while the admin acts as a customer, every audit row of the request names the admin as
// the actor and the customer as `actingAs`, so the log never says Aino signed what the admin did.
import { describe, expect, it } from 'vitest';
import { attributeAuditEntry } from './attribution';

const entry = {
  actor: 'cust-aino',
  action: 'contract.signed',
  entityType: 'contract' as const,
  entityId: 'contract-1',
  details: { quoteId: 'q-1' },
};

describe('attributeAuditEntry', () => {
  it("records the admin as the actor and the customer as actingAs in the admin's session", () => {
    expect(attributeAuditEntry(entry, 'admin')).toEqual({
      ...entry,
      actor: 'admin',
      details: { quoteId: 'q-1', actingAs: 'cust-aino' },
    });
  });

  it("leaves the admin's own rows as they are", () => {
    const own = { ...entry, actor: 'admin' };
    expect(attributeAuditEntry(own, 'admin')).toBe(own);
  });

  it("leaves a customer's own session, and a request with no session, as they are", () => {
    expect(attributeAuditEntry(entry, 'cust-aino')).toBe(entry);
    expect(attributeAuditEntry(entry, null)).toBe(entry);
  });

  it('wraps details that are not an object, and adds actingAs when there are none', () => {
    expect(attributeAuditEntry({ ...entry, details: 'paid' }, 'admin').details).toEqual({
      value: 'paid',
      actingAs: 'cust-aino',
    });
    expect(attributeAuditEntry({ ...entry, details: [1, 2] }, 'admin').details).toEqual({
      value: [1, 2],
      actingAs: 'cust-aino',
    });
    const { details: _ignored, ...bare } = entry;
    expect(attributeAuditEntry(bare, 'admin').details).toEqual({ actingAs: 'cust-aino' });
  });

  it('never lets a detail named actingAs hide who was acted as', () => {
    const forged = { ...entry, details: { actingAs: 'cust-mikko' } };
    expect(attributeAuditEntry(forged, 'admin').details).toEqual({ actingAs: 'cust-aino' });
  });
});
