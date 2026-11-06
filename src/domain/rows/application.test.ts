import { describe, expect, it } from 'vitest';
import { applicationRow } from '../../../tests/helpers/row-examples';
import {
  answersSchema,
  applicationDecisionUpdateSchema,
  applicationRowSchema,
  MAX_ANSWERS,
  MAX_QUESTION_ID_LENGTH,
} from './application';

const refuses = (row: unknown) => applicationRowSchema.safeParse(row).success === false;

describe('applicationRowSchema: the answers and what the rules decided', () => {
  it('accepts an approved application with its reasons as codes', () => {
    expect(applicationRowSchema.parse(applicationRow())).toEqual(applicationRow());
  });

  it('refuses a decision the flow does not have', () => {
    expect(refuses({ ...applicationRow(), decision: 'maybe' })).toBe(true);
  });

  it('refuses answers that are not JSON of question ids', () => {
    expect(refuses({ ...applicationRow(), answers_json: '{"birth_date":"1990-04-12"}' })).toBe(
      true
    );
    expect(refuses({ ...applicationRow(), answers_json: 'not json' })).toBe(true);
  });

  it('refuses more answers than the bank could ever ask, and an id longer than any question id', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_ANSWERS + 1 }, (_, i) => [`q_x${i}`, 'x'])
    );
    expect(answersSchema.safeParse(many).success).toBe(false);
    const exactly = Object.fromEntries(
      Array.from({ length: MAX_ANSWERS }, (_, i) => [`q_x${i}`, 'x'])
    );
    expect(answersSchema.safeParse(exactly).success).toBe(true);
    expect(
      answersSchema.safeParse({ [`q_${'a'.repeat(MAX_QUESTION_ID_LENGTH - 1)}`]: 'x' }).success
    ).toBe(false);
    expect(
      answersSchema.safeParse({ [`q_${'a'.repeat(MAX_QUESTION_ID_LENGTH - 2)}`]: 'x' }).success
    ).toBe(true);
  });

  it('refuses a reason written as a sentence (team rule 6)', () => {
    const sentence = JSON.stringify([{ code: 'You are too young', params: {} }]);
    expect(refuses({ ...applicationRow(), reasons_json: sentence })).toBe(true);
  });

  it('names a reviewer only once someone decided: never on an open manual review', () => {
    expect(refuses({ ...applicationRow(), decision: 'manual_review', reviewed_by: 'admin' })).toBe(
      true
    );
    expect(
      applicationRowSchema.safeParse({ ...applicationRow(), decision: 'manual_review' }).success
    ).toBe(true);
  });
});

describe('applicationDecisionUpdateSchema: a manual review or the signatory decides', () => {
  const update = {
    decision: 'awaiting_signatory',
    reasons_json: JSON.stringify([{ code: 'reviewed', params: { by: 'admin' } }]),
    decided_on: '2026-11-06',
    reviewed_by: 'admin',
  };

  it('accepts a decided review that now waits for the signatory (card 6)', () => {
    expect(applicationDecisionUpdateSchema.parse(update)).toEqual(update);
  });

  it('refuses an update without the reviewer, or back to manual review', () => {
    expect(applicationDecisionUpdateSchema.safeParse({ ...update, reviewed_by: ' ' }).success).toBe(
      false
    );
    expect(
      applicationDecisionUpdateSchema.safeParse({ ...update, decision: 'manual_review' }).success
    ).toBe(false);
  });
});
