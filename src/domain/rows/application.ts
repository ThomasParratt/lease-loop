// The write schema of an `Application` row (prisma/schema.prisma) and the shapes of its JSON
// columns (the server reads them back with `parseStoredJson`). The answers' shape moved here from src/server/routes.ts so the domain owns it.
import { z } from 'zod';
import { applicationDecisionSchema } from '../statuses';
import { idSchema, isoDateSchema, jsonText, ON_VALID_FIELDS, outcomeSchema } from './fields';

/** One answer: text, a choice, an ISO day, cents as digits, or a list (beneficial owners). */
export const answerSchema = z.union([z.string().max(500), z.array(z.string().max(200)).max(20)]);

/** Question id → answer. */
export const answersSchema = z.record(z.string().regex(/^q_[a-z0-9_]+$/), answerSchema);
export type Answers = z.infer<typeof answersSchema>;

export const reasonsSchema = z.array(outcomeSchema);

/** The actor who decided a manual review or the signatory; never blank. */
const reviewerSchema = z.string().trim().min(1).max(200);

export const applicationRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    customer_id: idSchema,
    quote_id: idSchema,
    answers_json: jsonText(answersSchema),
    decision: applicationDecisionSchema,
    reasons_json: jsonText(reasonsSchema),
    decided_on: isoDateSchema,
    reviewed_by: reviewerSchema.nullable().optional(),
  })
  .refine((row) => !(row.decision === 'manual_review' && row.reviewed_by), {
    message: 'an open manual review has no reviewer yet',
    path: ['reviewed_by'],
    ...ON_VALID_FIELDS,
  });

/** The columns a manual review or the signatory changes (D10). */
export const applicationDecisionUpdateSchema = z.strictObject({
  decision: applicationDecisionSchema.exclude(['manual_review']),
  reasons_json: jsonText(reasonsSchema),
  decided_on: isoDateSchema,
  reviewed_by: reviewerSchema,
});
