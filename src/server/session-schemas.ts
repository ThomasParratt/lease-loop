// The contracts of the sign-in routes (D91) and the admin's demo tools on the session (D93,
// D94). Imported by the routes and by the route table (src/server/routes.ts).
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '@/domain/auth/credentials';

/** Body of `POST /api/session`. Only the e-mail and the password: the type is the record's (D92). */
export const logInBodySchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
  // Not the new-password rule: an old password is checked, not judged. The bound caps the work.
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH * 4),
});

/** The session as the browser may know it: never the token or anything about the password. */
export const sessionStateSchema = z.object({
  /** Who the request acts as: a customer id, `admin` or `anonymous`. */
  actor: z.string().min(1),
  /** Who signed in, or null when nobody has. */
  account: z.string().nullable(),
  /** The customer the admin acts as (D93). */
  actingAs: z.string().nullable(),
  /** The demo clock's day on the admin's session (D94). */
  asOf: z.string().nullable(),
  /** When the session ends, an ISO instant. */
  expiresAt: z.string().nullable(),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

/** Body of `POST /api/actor`: a customer id to act as, or `admin` to stop acting (D93). */
export const actorBodySchema = z.strictObject({
  actor: z.string().min(1).max(100),
});
