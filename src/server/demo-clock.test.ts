// D94: today is the real day unless the session holds a demo clock day, which only admin
// routes set. A day that does not exist is ignored.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { cookiesFor } from '../../tests/helpers/sessions';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import { todayIso } from './today';

const holder = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const { isIsoDay, readDemoClock, resolveToday, todayForRequest } = await import('./demo-clock');

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
  holder.cookies = new Map();
});

describe('isIsoDay', () => {
  it('accepts real days and refuses the rest', () => {
    expect(isIsoDay('2028-02-29')).toBe(true);
    expect(isIsoDay('2026-02-29')).toBe(false);
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('2026-1-01')).toBe(false);
    expect(isIsoDay('2026-11-00')).toBe(false);
  });
});

describe('resolveToday', () => {
  it('lets a valid override win and ignores anything else', () => {
    expect(resolveToday('2026-11-08', '2027-01-01')).toBe('2027-01-01');
    expect(resolveToday('2026-11-08', '2027-99-99')).toBe('2026-11-08');
    expect(resolveToday('2026-11-08', null)).toBe('2026-11-08');
    expect(resolveToday('2026-11-08', undefined)).toBe('2026-11-08');
  });
});

describe('todayForRequest and readDemoClock', () => {
  it('is the real day with no session', async () => {
    expect(await todayForRequest(db)).toBe(todayIso());
    expect(await readDemoClock(db)).toEqual({
      today: todayIso(),
      systemToday: todayIso(),
      overridden: false,
    });
  });

  it("is the admin session's demo clock day", async () => {
    holder.cookies = await cookiesFor(db, 'admin', { asOf: '1999-12-31' });
    expect(await readDemoClock(db)).toMatchObject({ today: '1999-12-31', overridden: true });
  });

  it('ignores a stored day that does not exist', async () => {
    holder.cookies = await cookiesFor(db, 'admin', { asOf: '2027-99-99' });
    expect(await todayForRequest(db)).toBe(todayIso());
  });

  it('no cookie of the browser moves the day: the old clock cookie is ignored', async () => {
    holder.cookies = new Map([['lease-loop-as-of', '2027-01-01']]);
    expect(await todayForRequest(db)).toBe(todayIso());
  });
});
