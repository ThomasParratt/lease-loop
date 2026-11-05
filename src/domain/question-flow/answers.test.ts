import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import {
  answersFromCustomer,
  eligibilityInputFromAnswers,
  grossFromNetCents,
  parseEurosToCents,
  validateAnswer,
} from './answers';
import { isComplete, pruneAnswers, type FlowContext } from './engine';

let bank: Question[];
let customers: Customer[];
beforeAll(async () => {
  bank = (await loadQuestions()).questions;
  customers = await loadCustomers();
});

describe('parseEurosToCents', () => {
  it('reads whole euros and both decimal marks without floats', () => {
    expect(parseEurosToCents('3200')).toBe(320_000);
    expect(parseEurosToCents('3 200,50')).toBe(320_050);
    expect(parseEurosToCents('3200.5')).toBe(320_050);
    expect(parseEurosToCents('0,07')).toBe(7);
    expect(parseEurosToCents('1999.99 €')).toBe(199_999);
  });

  it('is null for anything that is not an amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1,2,3', '.5']) {
      expect(parseEurosToCents(bad)).toBeNull();
    }
  });
});

describe('grossFromNetCents', () => {
  it('card 1: 10 730 net at 25.5 % is 13 466 gross (VAT 2 736, half up)', () => {
    expect(grossFromNetCents(10_730, 2_550)).toBe(13_466);
  });

  it('rounds exactly half a cent up', () => {
    // 2 × 2 500 bp = 0.5 cent of VAT → 1
    expect(grossFromNetCents(2, 2_500)).toBe(3);
    expect(grossFromNetCents(0, 2_550)).toBe(0);
  });
});

describe('eligibilityInputFromAnswers', () => {
  const context: FlowContext = {
    customerType: 'company',
    category: 'e_bike',
    financedCents: 2_196_000,
    termMonths: 36,
  };

  it('reads the answers that matter and ignores blanks', () => {
    const input = eligibilityInputFromAnswers({
      context,
      answers: {
        q_customer_type: 'company',
        q_business_id: ' 3299871-7 ',
        q_can_sign: 'no',
        q_signatory_email: 'ceo@norvi.example.com',
        q_pep: 'no',
        q_country: '',
      },
      startDate: '2026-11-05',
      grossMonthlyRentCents: 74_036,
    });
    expect(input).toMatchObject({
      customerType: 'company',
      businessId: '3299871-7',
      applicantCanSign: false,
      signatoryEmail: 'ceo@norvi.example.com',
      isPep: false,
      country: undefined,
      financedCents: 2_196_000,
    });
  });

  it('money answers are cents as digits; a known PEP stays a PEP', () => {
    const input = eligibilityInputFromAnswers({
      context: { ...context, customerType: 'consumer' },
      answers: { q_monthly_income: '320000' },
      startDate: '2026-11-05',
      grossMonthlyRentCents: 1,
      knownPep: true,
    });
    expect(input.monthlyNetIncomeCents).toBe(320_000);
    expect(input.customerType).toBe('consumer');
    expect(input.isPep).toBe(true);
    expect(input.applicantCanSign).toBeUndefined();
  });
});

describe('answersFromCustomer', () => {
  it('fills every visible question for every persona, at every amount', () => {
    for (const c of customers) {
      for (const financedCents of [30_000, 389_000, 2_196_000, 12_500_000]) {
        for (const category of ['e_bike', 'laptop', 'farm_machine']) {
          const ctx = { customerType: c.type, category, financedCents, termMonths: 36 };
          const answers = pruneAnswers(bank, ctx, answersFromCustomer(c));
          expect(isComplete(bank, ctx, answers)).toBe(true);
        }
      }
    }
  });
});

describe('validateAnswer', () => {
  const q = (id: string) => bank.find((x) => x.id === id)!;

  it('choice answers must be one of the options', () => {
    expect(validateAnswer(q('q_can_sign'), 'no')).toBe(true);
    expect(validateAnswer(q('q_can_sign'), 'maybe')).toBe(false);
  });

  it('dates must be real ISO days', () => {
    expect(validateAnswer(q('q_birth_date'), '2008-02-29')).toBe(true);
    expect(validateAnswer(q('q_birth_date'), '2009-02-29')).toBe(false);
    expect(validateAnswer(q('q_birth_date'), '10.3.2009')).toBe(false);
  });

  it('money is cents as digits, e-mail needs an @ and a dot, lists need an item', () => {
    expect(validateAnswer(q('q_monthly_income'), '320000')).toBe(true);
    expect(validateAnswer(q('q_monthly_income'), '3200.00')).toBe(false);
    expect(validateAnswer(q('q_email'), 'a@example.com')).toBe(true);
    expect(validateAnswer(q('q_email'), 'a@b')).toBe(false);
    expect(validateAnswer(q('q_beneficial_owners'), ['Jussi Haapala (60 %)'])).toBe(true);
    expect(validateAnswer(q('q_beneficial_owners'), [])).toBe(false);
    expect(validateAnswer(q('q_beneficial_owners'), 'Jussi')).toBe(false);
  });

  it('a wrong business id check digit is still a valid answer (eligibility rejects it)', () => {
    expect(validateAnswer(q('q_business_id'), '1234567-8')).toBe(true);
    expect(validateAnswer(q('q_business_id'), '   ')).toBe(false);
  });

  it('every persona answer passes validation', () => {
    for (const c of customers) {
      for (const [id, answer] of Object.entries(answersFromCustomer(c))) {
        expect(validateAnswer(q(id), answer), `${c.id} ${id}`).toBe(true);
      }
    }
  });
});
