// The contracts of the strong-identification routes (D95 to D97), imported by the routes and the
// route table (src/server/routes.ts).
import { z } from 'zod';
import { identificationPurposeSchema } from '@/domain/identity/identification';
import { locales } from '@/i18n/locales';

/** Body of `POST /api/identifications`: what the identification is for and where to go after. */
export const startIdentificationBodySchema = z.strictObject({
  purpose: identificationPurposeSchema,
  /** The application to sign, for `sign_contract`. */
  applicationId: z.string().min(1).max(100).optional(),
  /** A path of this site; anything else falls back to the catalogue (safeNextPath). */
  next: z.string().max(500).optional(),
  locale: z.enum(locales),
});

/** Where the browser goes next: the broker's page, or our callback. */
export const redirectResponseSchema = z.object({ redirectTo: z.string().min(1) });

/** Body of `POST /api/test-bank/authorize`: the person chosen on the Test Bank page, or cancel. */
export const testBankAuthorizeBodySchema = z.strictObject({
  state: z.string().min(1).max(100),
  nonce: z.string().min(1).max(100),
  customerId: z.string().min(1).max(100).optional(),
  cancel: z.literal(true).optional(),
});

/** Query of `GET /api/identifications/callback`, as the broker sends it. */
export const identificationCallbackQuerySchema = z.object({
  state: z.string().min(1).max(100),
  code: z.string().min(1).max(200).optional(),
});
