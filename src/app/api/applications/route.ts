// POST /api/applications   body: { quoteId, customerId, answers, onBehalfOf? }
// The customer must be the actor (the "continue as" cookie, D17, D40): nobody applies in
// another's name. The admin applies for a customer only with onBehalfOf naming them (D47).
// Prunes the answers to the questions that apply, checks them, evaluates the eligibility rules
// (D9) and stores the application with its decision. The day is the request's (demo clock).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { createApplication } from '@/server/applications';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { createApplicationBodySchema } from '@/server/routes';

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, createApplicationBodySchema);
  const today = await todayForRequest();
  const actor = await readActor(db);

  const result = await createApplication(db, { ...body, today, actor });
  if (result.ok) return ok(result.application, { status: 201 });

  switch (result.reason) {
    case 'quote_not_found':
      return fail(404, 'QUOTE_NOT_FOUND', 'No quote with that id');
    case 'customer_not_found':
      return fail(404, 'CUSTOMER_NOT_FOUND', 'No customer with that id');
    case 'not_applicant':
      return fail(403, 'NOT_APPLICANT', 'You can apply only in your own name');
    case 'quote_expired':
      return fail(409, 'QUOTE_EXPIRED', 'The quote is no longer valid');
    case 'quote_in_use':
      return fail(409, 'QUOTE_IN_USE', 'The quote already has a pending or approved application', {
        applicationId: result.applicationId,
      });
    case 'incomplete_answers':
      return fail(400, 'INCOMPLETE_ANSWERS', 'A question is not answered', {
        questionId: result.questionId,
      });
    case 'invalid_answer':
      return fail(400, 'INVALID_ANSWER', 'An answer is not valid', {
        questionId: result.questionId,
        problem: result.problem,
      });
  }
});
