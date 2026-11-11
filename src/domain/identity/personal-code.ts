// The Finnish personal identity code (D95, D97): DDMMYY, a century sign, a three-digit
// individual number and a check character, which is the nine digits as one number modulo 31,
// looked up in `0123456789ABCDEFHJKLMNPRSTUVWXY`. Individual numbers 900 to 999 are artificial
// codes, never given to a real person: the Test Bank gives those to the data pack's people.

const CHECK_CHARACTERS = '0123456789ABCDEFHJKLMNPRSTUVWXY';
const CENTURY_OF_SIGN: Readonly<Record<string, number>> = {
  '+': 1800,
  '-': 1900,
  Y: 1900,
  X: 1900,
  W: 1900,
  V: 1900,
  U: 1900,
  A: 2000,
  B: 2000,
  C: 2000,
  D: 2000,
  E: 2000,
  F: 2000,
};

export type ParsedPersonalCode =
  { ok: true; birthDate: string; individualNumber: number; artificial: boolean } | { ok: false };

const pad = (value: number, width: number) => String(value).padStart(width, '0');

function isRealDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function checkCharacter(digits: string): string {
  return CHECK_CHARACTERS[Number(digits) % 31]!;
}

/** Reads `code`, checking its form, its day and its check character. Exact: no trimming. */
export function parsePersonalCode(code: string): ParsedPersonalCode {
  const match = /^(\d{2})(\d{2})(\d{2})([-+A-FU-Y])(\d{3})([0-9A-Y])$/.exec(code);
  if (!match) return { ok: false };
  const [, dd, mm, yy, sign, individual, check] = match as unknown as string[];
  const year = CENTURY_OF_SIGN[sign!]! + Number(yy);
  const [month, day, number] = [Number(mm), Number(dd), Number(individual)];
  if (number < 2 || !isRealDay(year, month, day)) return { ok: false };
  if (checkCharacter(`${dd}${mm}${yy}${individual}`) !== check) return { ok: false };
  return {
    ok: true,
    birthDate: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    individualNumber: number,
    artificial: number >= 900,
  };
}

/** An artificial code (individual number 900 to 999) for a person born on `birthDate`. */
export function testPersonalCode(birthDate: string, individualNumber: number): string {
  if (!Number.isInteger(individualNumber) || individualNumber < 900 || individualNumber > 999) {
    throw new Error('An artificial individual number is 900 to 999');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const [year, month, day] = match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [0, 0, 0];
  if (!match || !isRealDay(year, month, day)) throw new Error(`Not a date: ${birthDate}`);
  if (year < 1900 || year > 2099) throw new Error('Only births from 1900 to 2099');
  const digits = `${pad(day, 2)}${pad(month, 2)}${pad(year % 100, 2)}${pad(individualNumber, 3)}`;
  return `${digits.slice(0, 6)}${year < 2000 ? '-' : 'A'}${digits.slice(6)}${checkCharacter(digits)}`;
}
