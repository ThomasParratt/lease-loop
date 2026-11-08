// D91: passwords are scrypt with a salt per account, compared in constant time; an unknown or
// unreadable stored hash never verifies, and the dummy check costs the same work.
import { describe, expect, it } from 'vitest';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords';

describe('hashPassword and verifyPassword', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false);
  });

  it('salts every hash, so one password never gives the same hash twice', async () => {
    expect(await hashPassword('same password here')).not.toBe(
      await hashPassword('same password here')
    );
  });

  it('treats the same text in another Unicode form as the same password (NFC)', async () => {
    const stored = await hashPassword('Mäkelä-salasana'.normalize('NFC'));
    expect(await verifyPassword('Mäkelä-salasana'.normalize('NFD'), stored)).toBe(true);
  });

  it('never verifies against a stored value it cannot read', async () => {
    for (const stored of [
      '',
      'disabled',
      'scrypt$1$2$3',
      'bcrypt$a$b$c$d$e',
      'scrypt$x$8$1$AA==$AA==',
    ]) {
      expect(await verifyPassword('anything at all', stored)).toBe(false);
    }
  });

  it('refuses a cost above the cap rather than doing unbounded work', async () => {
    const stored = (await hashPassword('correct horse battery')).replace('$32768$', '$2097152$');
    expect(await verifyPassword('correct horse battery', stored)).toBe(false);
  });

  it('burnPasswordCheck does the scrypt work and answers false', async () => {
    expect(await burnPasswordCheck('whatever')).toBe(false);
  });
});
