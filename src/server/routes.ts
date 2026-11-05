// The route table: one row per API route, with the Zod schemas of its params, query, body and
// success response (the `data` inside the `ok()` envelope). Route files import their schemas
// from here, `src/server/openapi.ts` turns the table into docs/openapi.json
// (`npm run openapi`), and routes.test.ts fails when a route.ts has no row or a row no file.
//
// Contract first (AGENTS.md, team rule 2): a slice's first commit adds its row here.
import { z } from 'zod';
import { assetCategorySchema, assetSchema, assetStatusSchema, isoDateSchema } from '@/data/schemas';
import { assetEventKindSchema } from '@/domain/statuses';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RouteDefinition = {
  method: HttpMethod;
  /** The Next.js pattern, e.g. `/api/assets/[id]/status`. */
  path: string;
  summary: string;
  /** Groups the route in the OpenAPI document; one tag per slice. */
  tag: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** The `data` of the success envelope. */
  response: z.ZodType;
  /** The success status; 200 when not set. */
  status?: number;
};

// ---------- assets ----------

export const listAssetsQuerySchema = z.object({ category: assetCategorySchema.optional() });

export const assetIdParamsSchema = z.object({ id: z.string().min(1) });

export const changeAssetStatusBodySchema = z.strictObject({
  status: assetStatusSchema,
  actor: z.string().trim().min(1).max(100),
});

// ---------- actor ----------

/** Body of `POST /api/actor`. Whether the actor exists is checked against the database. */
export const actorBodySchema = z.strictObject({
  actor: z.string().min(1).max(100),
});

/** A customer id, `admin` or `anonymous`. */
export const actorResponseSchema = z.object({ actor: z.string().min(1) });

// ---------- demo clock ----------

/** Body of `POST /api/demo/clock`: a real day to travel to, or `null` to go back to today. */
export const demoClockBodySchema = z.strictObject({
  asOf: isoDateSchema.nullable(),
});

export const demoClockResponseSchema = z.object({
  asOf: isoDateSchema.nullable(),
  today: isoDateSchema,
});

// ---------- audit log ----------

export const auditLogEntrySchema = z.object({
  id: z.number().int(),
  created_at: z.iso.datetime(),
  actor: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  details: z.unknown(),
});

// ---------- passport and impact ----------

const passportEventSchema = z.object({
  id: z.number().int(),
  kind: assetEventKindSchema,
  on_date: isoDateSchema,
  contract_id: z.string().nullable(),
  details: z.unknown(),
});

const lifeSchema = z.object({
  index: z.number().int().nonnegative(),
  start: isoDateSchema.nullable(),
  end: isoDateSchema.nullable(),
  contractId: z.string().nullable(),
  months: z.number().int().nonnegative().nullable(),
  endKind: z.enum(['returned', 'bought', 'passed_on']).nullable(),
  estimated: z.boolean(),
  between: z.array(passportEventSchema),
});

/** `GET /api/assets/[id]/passport`: the asset, its lives as of today and the CO2 they saved. */
export const passportResponseSchema = z.object({
  asset: assetSchema,
  asOf: isoDateSchema,
  before: z.array(passportEventSchema),
  lives: z.array(lifeSchema),
  co2: z.object({
    /** Per life, whole kg; the first life is always 0. */
    perLifeKg: z.array(z.number().int().nonnegative()),
    /** Rounded once from the unrounded grams, so not always the sum of `perLifeKg`. */
    totalKg: z.number().int().nonnegative(),
  }),
});

// ---------- the table ----------

export const ROUTES: readonly RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/actor',
    summary: 'Act as a customer or admin: sets the actor cookie (no login, D17)',
    tag: 'actor',
    body: actorBodySchema,
    response: actorResponseSchema,
  },
  {
    method: 'DELETE',
    path: '/api/actor',
    summary: 'Stop acting: clears the actor cookie, so the visitor is anonymous',
    tag: 'actor',
    response: actorResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/assets',
    summary: 'List the assets in the catalogue, optionally of one category',
    tag: 'assets',
    query: listAssetsQuerySchema,
    response: z.array(assetSchema),
  },
  {
    method: 'PATCH',
    path: '/api/assets/[id]/status',
    summary: "Change an asset's status and write the audit row in the same transaction",
    tag: 'assets',
    params: assetIdParamsSchema,
    body: changeAssetStatusBodySchema,
    response: assetSchema,
  },
  {
    method: 'GET',
    path: '/api/assets/[id]/passport',
    summary: "An asset's passport: its lives across leases and the CO2 its later lives saved (D15)",
    tag: 'passport',
    params: assetIdParamsSchema,
    response: passportResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/demo/clock',
    summary:
      'Set the demo clock to a day, or clear it with null (the one date the browser may send)',
    tag: 'demo',
    body: demoClockBodySchema,
    response: demoClockResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/audit-log',
    summary: 'The 50 newest audit rows, newest first',
    tag: 'audit',
    response: z.array(auditLogEntrySchema),
  },
];

/** `METHOD /api/…`, the key of a row. */
export function routeKey(route: Pick<RouteDefinition, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}
