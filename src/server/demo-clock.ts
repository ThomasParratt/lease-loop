// The demo clock (D94): lets the admin travel to any day, so a scenario card dated September
// 2026 or February 2028 runs on its own date. It lives on the admin's session (`as_of`), set
// only by admin routes (POST /api/demo/clock and the card runs), so no visitor can move "today".
// `todayIso()` stays the only real clock. Pages and routes call `todayForRequest(db)` once and
// pass the day down; the domain never sees a clock.
import { readSession } from './actor';
import type { PrismaClient } from './prisma-client';
import { todayIso } from './today';

/** True for a real calendar day written `YYYY-MM-DD` (so `2026-02-29` is false). */
export function isIsoDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** The day the app should treat as today: a valid override wins, anything else is ignored. */
export function resolveToday(systemToday: string, override: string | null | undefined): string {
  return typeof override === 'string' && isIsoDay(override) ? override : systemToday;
}

export type DemoClock = {
  /** The day the app runs on for this request. */
  today: string;
  /** The real day, from the system clock. */
  systemToday: string;
  /** True when the demo clock moved the day. */
  overridden: boolean;
};

/** The demo clock for this request, for the demo page that shows whether it is moved. */
export async function readDemoClock(db: PrismaClient): Promise<DemoClock> {
  const systemToday = todayIso();
  const session = await readSession(db);
  const today = resolveToday(systemToday, session?.asOf);
  return { today, systemToday, overridden: today !== systemToday };
}

/** Today for this request: the session's demo clock if it holds a valid day, else the real day. */
export async function todayForRequest(db: PrismaClient): Promise<string> {
  return (await readDemoClock(db)).today;
}
