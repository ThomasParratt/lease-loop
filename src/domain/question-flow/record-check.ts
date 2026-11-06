// The applicant's answers against the customer record we already hold (D38). An answer that
// differs is not refused (the record may be out of date, a sole trader may have incorporated),
// but the case is never approved by a rule: a person checks it. Without this, a 17-year-old
// consumer could answer "company" and the age question would never be asked.
import type { Customer } from '@/data/schemas';
import type { Answer, Answers } from './engine';
import { ALLOWED_COUNTRIES } from './eligibility';

const text = (answer: Answer | undefined): string | undefined =>
  typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : undefined;

/**
 * The question ids whose answer differs from the record, in the bank's order: the customer
 * type, the birth date, the country (a country outside FI, SE and EE is answered "other"),
 * the business id and, for a company, whether the applicant may sign (card 6: the coordinator
 * who may not sign on record answers "yes" and would otherwise be approved and sign). A
 * question not answered, or a field the record does not have, is not compared.
 */
export function recordMismatches(record: Customer, answers: Answers): string[] {
  const recorded: Record<string, string | undefined> = {
    q_customer_type: record.type,
    q_birth_date: 'birth_date' in record ? record.birth_date : undefined,
    q_country: ALLOWED_COUNTRIES.includes(record.country) ? record.country : 'other',
    q_business_id: 'business_id' in record ? record.business_id : undefined,
    q_can_sign:
      'applicant_can_sign' in record ? (record.applicant_can_sign ? 'yes' : 'no') : undefined,
  };
  return Object.entries(recorded)
    .filter(([id, value]) => {
      const answer = text(answers[id]);
      return value !== undefined && answer !== undefined && answer !== value.trim();
    })
    .map(([id]) => id);
}
