// Applications: the customer's answers to the question flow for a quote, and what the rules
// decided (D9), plus the person's decision on a manual review or the signatory's sign-off (D10).
import { randomUUID } from 'node:crypto';
import type { Application as ApplicationRow } from '@/generated/prisma/client';
import { loadCoefficientTable, loadQuestions } from '@/data/load';
import { applicationDecisionSchema, type ApplicationDecision } from '@/domain/statuses';
import type { Customer } from '@/data/schemas';
import {
  answerProblem,
  eligibilityInputFromAnswers,
  grossFromNetCents,
  type AnswerProblem,
} from '@/domain/question-flow/answers';
import { evaluate } from '@/domain/question-flow/eligibility';
import { recordMismatches } from '@/domain/question-flow/record-check';
import { mayDecideAsSignatory } from '@/domain/question-flow/signatory';
import {
  answersSchema,
  applicationDecisionUpdateSchema,
  applicationRowSchema,
  reasonsSchema,
} from '@/domain/rows/application';
import {
  nextQuestion,
  pruneAnswers,
  type Answer,
  type FlowContext,
} from '@/domain/question-flow/engine';
import { ADMIN_ACTOR } from './actor';
import { listAssets } from './assets';
import { withAudit } from './audit';
import { getCustomer } from './customers';
import type { PrismaClient } from './prisma-client';
import { parseRow, parseStoredJson } from './row-rules';
import { getQuote } from './quotes';

/** A reason as stored: the eligibility codes plus the two decision codes of D10. */
export type StoredReason = { code: string; params: Record<string, string | number> };

export type ApplicationView = {
  id: string;
  customerId: string;
  quoteId: string;
  answers: Record<string, Answer>;
  decision: ApplicationDecision;
  reasons: StoredReason[];
  decidedOn: string;
  reviewedBy: string | null;
  createdAt: string;
};

export function toApplicationView(row: ApplicationRow): ApplicationView {
  return {
    id: row.id,
    customerId: row.customer_id,
    quoteId: row.quote_id,
    answers: parseStoredJson('application.answers_json', answersSchema, row.answers_json),
    decision: applicationDecisionSchema.parse(row.decision),
    reasons: parseStoredJson('application.reasons_json', reasonsSchema, row.reasons_json),
    decidedOn: row.decided_on,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at.toISOString(),
  };
}

export type FlowSetup = { context: FlowContext; quoteValidUntil: string; customerIsPep: boolean };

/**
 * The deal a quote and a customer make for the question flow. The quote is read through the
 * pricing slice's `getQuote`, never from its table (one owner per table, team rule 3).
 */
export async function flowSetupFor(
  db: PrismaClient,
  quoteId: string,
  customerId: string
): Promise<
  | {
      ok: true;
      setup: FlowSetup;
      quote: { monthlyNetCents: number; vatRateBp: number };
      customer: Customer;
    }
  | { ok: false; reason: 'quote_not_found' | 'customer_not_found' }
> {
  const quote = await getQuote(db, quoteId);
  if (!quote) return { ok: false, reason: 'quote_not_found' };
  const customer = await getCustomer(db, customerId);
  if (!customer) return { ok: false, reason: 'customer_not_found' };
  const deal = quote.breakdown;
  const asset = (await listAssets(db)).find((a) => a.id === deal.assetId);
  if (!asset) return { ok: false, reason: 'quote_not_found' };
  return {
    ok: true,
    setup: {
      context: {
        customerType: customer.type,
        category: asset.category,
        financedCents: deal.financedCents,
        termMonths: deal.termMonths,
      },
      quoteValidUntil: quote.validUntil,
      customerIsPep: customer.is_pep,
    },
    quote: { monthlyNetCents: deal.monthlyNetCents, vatRateBp: deal.vatRateBasisPoints },
    customer,
  };
}

export type CreateApplicationInput = {
  quoteId: string;
  customerId: string;
  answers: Record<string, Answer>;
  /** The request's day (`todayForRequest()`): the decision date and the contract start. */
  today: string;
  actor: string;
};

export type CreateApplicationResult =
  | { ok: true; application: ApplicationView }
  | {
      ok: false;
      reason:
        | 'quote_not_found'
        | 'customer_not_found'
        | 'quote_expired'
        | 'not_applicant'
        | 'incomplete_answers'
        | 'invalid_answer';
      questionId?: string;
      /** Why the answer of `questionId` was refused, for the page to write. */
      problem?: AnswerProblem;
    };

/**
 * Only the customer who is acting applies, in their own name (D40): not another customer, not
 * the admin, not anonymous. Then it prunes the answers to the questions that apply, checks that every one is answered and
 * valid on the day (D37, D39), compares them with the customer record (D38), evaluates the
 * eligibility rules and writes the application with its audit row.
 */
export async function createApplication(
  db: PrismaClient,
  input: CreateApplicationInput
): Promise<CreateApplicationResult> {
  if (input.actor !== input.customerId) return { ok: false, reason: 'not_applicant' };
  const found = await flowSetupFor(db, input.quoteId, input.customerId);
  if (!found.ok) return found;
  const { context, quoteValidUntil, customerIsPep } = found.setup;
  if (quoteValidUntil < input.today) return { ok: false, reason: 'quote_expired' };

  const { questions, eligibility_rules: rules } = await loadQuestions();
  const answers = pruneAnswers(questions, context, input.answers);
  for (const question of questions) {
    const answer = answers[question.id];
    const problem =
      answer === undefined
        ? null
        : answerProblem(question, answer, { today: input.today, answers });
    if (problem) return { ok: false, reason: 'invalid_answer', questionId: question.id, problem };
  }
  const missing = nextQuestion(questions, context, answers);
  if (missing) return { ok: false, reason: 'incomplete_answers', questionId: missing.id };

  const table = await loadCoefficientTable();
  const result = evaluate(
    rules,
    eligibilityInputFromAnswers({
      context,
      answers,
      startDate: input.today,
      grossMonthlyRentCents: grossFromNetCents(found.quote.monthlyNetCents, found.quote.vatRateBp),
      financedLimits: {
        minCents: Math.min(...table.bands.map((b) => b.min_financed_cents)),
        maxCents: Math.max(...table.bands.map((b) => b.max_financed_cents)),
      },
      knownPep: customerIsPep,
      recordMismatches: recordMismatches(found.customer, answers),
    })
  );

  const id = randomUUID();
  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.created',
      entityType: 'application',
      entityId: id,
      details: {
        quoteId: input.quoteId,
        customerId: input.customerId,
        decision: result.decision,
        reasons: result.reasons,
      },
    },
    (tx) =>
      tx.application.create({
        data: parseRow('application', applicationRowSchema, {
          id,
          customer_id: input.customerId,
          quote_id: input.quoteId,
          answers_json: JSON.stringify(answers),
          decision: result.decision,
          reasons_json: JSON.stringify(result.reasons),
          decided_on: input.today,
        }),
      })
  );
  return { ok: true, application: toApplicationView(row) };
}

export async function getApplication(
  db: PrismaClient,
  id: string
): Promise<ApplicationView | null> {
  const row = await db.application.findUnique({ where: { id } });
  return row ? toApplicationView(row) : null;
}

export type DecideApplicationInput = {
  id: string;
  decision: 'approved' | 'rejected';
  /** Who decided: the reviewer (admin) or the signatory who signed or declined. */
  reviewedBy: string;
  today: string;
  actor: string;
};

const stringAnswer = (answer: Answer | undefined) =>
  typeof answer === 'string' ? answer : undefined;

/** Thrown inside the transaction when another request decided first, so nothing is written. */
class LostDecisionRace extends Error {}

export type DecideApplicationResult =
  | { ok: true; application: ApplicationView }
  | { ok: false; reason: 'not_found' | 'not_pending' | 'admin_only' | 'not_signatory' };

/**
 * D10. A manual review is decided by an admin; a manual review that also needs a signatory
 * becomes `awaiting_signatory` when approved. An `awaiting_signatory` case is signed (approved)
 * or declined (rejected) by the named signatory only, on the company's own account (D39).
 * Any other state is final. Two decisions at
 * the same instant: the first wins, the second answers `not_pending` and writes nothing.
 */
export async function decideApplication(
  db: PrismaClient,
  input: DecideApplicationInput
): Promise<DecideApplicationResult> {
  const current = await getApplication(db, input.id);
  if (!current) return { ok: false, reason: 'not_found' };
  if (current.decision !== 'manual_review' && current.decision !== 'awaiting_signatory') {
    return { ok: false, reason: 'not_pending' };
  }
  if (current.decision === 'manual_review' && input.actor !== ADMIN_ACTOR) {
    return { ok: false, reason: 'admin_only' };
  }
  if (
    current.decision === 'awaiting_signatory' &&
    !mayDecideAsSignatory({
      actor: input.actor,
      applicantId: current.customerId,
      signatoryEmail: stringAnswer(current.answers.q_signatory_email),
      claimedBy: input.reviewedBy,
    })
  ) {
    return { ok: false, reason: 'not_signatory' };
  }

  const code = current.decision === 'manual_review' ? 'reviewed' : 'signatory_decided';
  const reason: StoredReason = {
    code,
    params: { by: input.reviewedBy, decision: input.decision, on: input.today },
  };
  const needsSignatory = current.reasons.some((r) => r.code === 'signatory_needed');
  const decision: ApplicationDecision =
    code === 'reviewed' && input.decision === 'approved' && needsSignatory
      ? 'awaiting_signatory'
      : input.decision;

  const data = parseRow('application', applicationDecisionUpdateSchema, {
    decision,
    reasons_json: JSON.stringify([...current.reasons, reason]),
    decided_on: input.today,
    reviewed_by: input.reviewedBy,
  });
  let row: ApplicationRow;
  try {
    row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'application.decided',
        entityType: 'application',
        entityId: input.id,
        details: { from: current.decision, to: decision, by: input.reviewedBy },
      },
      async (tx) => {
        // Only a row still in the state this request read changes, so a concurrent second
        // decision is a no-op, not an overwrite.
        const { count } = await tx.application.updateMany({
          where: { id: input.id, decision: current.decision },
          data,
        });
        if (count === 0) throw new LostDecisionRace();
        return tx.application.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
  } catch (error) {
    if (error instanceof LostDecisionRace) return { ok: false, reason: 'not_pending' };
    throw error;
  }
  return { ok: true, application: toApplicationView(row) };
}
