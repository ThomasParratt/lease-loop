// What the sign-in form takes (D91, D92): an e-mail, compared trimmed and in lower case, and a
// password. A new password is 12 to 128 characters (code points, so "ä" and "🔑" count once);
// the upper bound caps the scrypt work a single request can ask for.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRefusal =
  | { code: 'password_too_short'; params: { min: number } }
  | { code: 'password_too_long'; params: { max: number } };

/** The e-mail as accounts are stored and looked up. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether `password` may be set as an account's password. */
export function checkNewPassword(
  password: string
): { ok: true } | { ok: false; reason: PasswordRefusal } {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: { code: 'password_too_short', params: { min: PASSWORD_MIN_LENGTH } },
    };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      reason: { code: 'password_too_long', params: { max: PASSWORD_MAX_LENGTH } },
    };
  }
  return { ok: true };
}
