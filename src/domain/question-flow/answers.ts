// From the applicant's answers to the eligibility input, and the small conversions around it.
import type { Customer, Question } from '@/data/schemas';
import type { Answer, Answers, FlowContext } from './engine';
import type { EligibilityInput } from './eligibility';

const text = (answer: Answer | undefined): string | undefined =>
  typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : undefined;

/**
 * Euros as typed by a person ("3200", "3 200,50", "3200.5") → integer cents, without
 * floating point: the digits are split at the decimal mark and joined. Null when it is not
 * an amount (negative, more than two decimals, letters).
 */
export function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s€]/g, ''); // \s includes the no-break space
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Whether an answer has the shape its question type needs. Choice: one of the options;
 * date: an ISO day; money: integer cents as digits; email: something@something; list: at
 * least one non-blank item; text: not blank. The business-id check digit is an eligibility
 * rule (a wrong one is a reason, not a typo to bounce), so text only needs a value.
 */
export function validateAnswer(question: Question, answer: Answer): boolean {
  if (question.type === 'list') {
    return Array.isArray(answer) && answer.length > 0 && answer.every((a) => a.trim() !== '');
  }
  const value = text(answer);
  if (value === undefined) return false;
  switch (question.type) {
    case 'choice':
      return question.options?.includes(value) ?? false;
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && isRealDay(value);
    case 'money':
      return /^\d{1,13}$/.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'text':
      return value.length <= 500;
  }
}

function isRealDay(iso: string): boolean {
  const [y = 0, m = 0, d = 0] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
  return d <= days;
}

/** A money answer (integer cents as digits) → cents, or undefined. */
function cents(answer: Answer | undefined): number | undefined {
  const value = text(answer);
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;
}

/**
 * Gross = net + VAT, the VAT rounded half up to the cent once:
 * VAT = (net × rate in basis points + 5 000) div 10 000. 10 730 at 2 550 bp → 2 736.
 * A local copy until the pricing slice's VAT helper lands.
 */
export function grossFromNetCents(netCents: number, vatRateBp: number): number {
  return netCents + Math.floor((netCents * vatRateBp + 5_000) / 10_000);
}

export type InputFromAnswers = {
  context: FlowContext;
  answers: Answers;
  startDate: string;
  grossMonthlyRentCents: number;
  financedLimits?: { minCents: number; maxCents: number };
  /** The customer record knows a PEP even when the amount is too small to ask. */
  knownPep?: boolean;
};

/** The eligibility input from the (pruned) answers of a flow. */
export function eligibilityInputFromAnswers(args: InputFromAnswers): EligibilityInput {
  const { answers, context } = args;
  const canSign = text(answers.q_can_sign);
  return {
    customerType: text(answers.q_customer_type) ?? context.customerType,
    startDate: args.startDate,
    birthDate: text(answers.q_birth_date),
    country: text(answers.q_country),
    monthlyNetIncomeCents: cents(answers.q_monthly_income),
    grossMonthlyRentCents: args.grossMonthlyRentCents,
    businessId: text(answers.q_business_id),
    isPep: text(answers.q_pep) === 'yes' || args.knownPep === true,
    applicantCanSign: canSign === undefined ? undefined : canSign === 'yes',
    signatoryEmail: text(answers.q_signatory_email),
    financedCents: context.financedCents,
    financedLimits: args.financedLimits,
  };
}

/**
 * The answers a data-pack customer would give, so a demo can pre-fill the flow and the tests
 * can run every persona. Fields the pack does not know (usage purpose, farm registry, PEP
 * details) get a neutral placeholder.
 */
export function answersFromCustomer(customer: Customer): Record<string, Answer> {
  const answers: Record<string, Answer> = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_usage_purpose: 'commuting',
    q_farm_registry: '123-456-789',
    q_pep: customer.is_pep ? 'yes' : 'no',
  };
  if (customer.is_pep) answers.q_pep_details = '-';
  if (customer.type === 'consumer' || customer.type === 'sole_trader') {
    answers.q_full_name = customer.name;
    answers.q_birth_date = customer.birth_date;
    answers.q_country = ['FI', 'SE', 'EE'].includes(customer.country) ? customer.country : 'other';
  }
  if (customer.type === 'consumer') {
    answers.q_employment = customer.employment;
    answers.q_monthly_income = String(customer.monthly_net_income_cents);
  }
  if (customer.type === 'sole_trader' || customer.type === 'company') {
    answers.q_business_id = customer.business_id;
    answers.q_vat_registered = customer.vat_registered ? 'yes' : 'no';
  }
  if (customer.type === 'company') {
    answers.q_company_name = customer.name;
    answers.q_can_sign = customer.applicant_can_sign ? 'yes' : 'no';
    if (!customer.applicant_can_sign)
      answers.q_signatory_email = `signatory@${customer.email.split('@')[1]}`;
    answers.q_annual_revenue = String(customer.annual_revenue_cents);
    answers.q_beneficial_owners = customer.beneficial_owners ?? ['-'];
  }
  return answers;
}
