// The refurbishment plan of a returned item, read from data/refurbishment-costs.json:
//
// 1. The fixed steps of its category, in the file's order, whose `when` rule holds on the
//    returned usage. The rules are parsed from the data, never hard-coded:
//    - `always`;
//    - `usage.value >= N <unit>`: the usage is at least N;
//    - `per started N <unit> since last service`: one step per started block of N, on the
//      returned usage (the pack has no service history, so the usage counter is taken as the
//      usage since the last service; docs/features/exits.md, open questions).
//    Any other text is an error, so a new rule in the data cannot be skipped silently.
// 2. The condition upgrades from the returned condition up to `targetCondition`, one step at a
//    time (`poor->fair`, then `fair->good`, …). An item already as good as the target needs
//    none and is never downgraded; a missing step in the data is an error.
//
// The usage after the plan is 0 when a step `resets_usage` (a new battery), else unchanged.
import type { AssetCategory, AssetCondition, RefurbishmentCosts, UsageUnit } from '@/data/schemas';
import { usageUnitSchema } from '@/data/schemas';

/** Worst first, the order the upgrades climb. */
const CLIMB: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

export type WhenRule =
  | { kind: 'always' }
  | { kind: 'usage_at_least'; value: number; unit: UsageUnit }
  | { kind: 'per_started'; block: number; unit: UsageUnit };

export type RefurbishmentStep =
  | { kind: 'fixed'; id: string; costCents: number; resetsUsage: boolean; quantity: number }
  | { kind: 'upgrade'; id: string; from: AssetCondition; to: AssetCondition; costCents: number };

export type RefurbishmentInput = {
  category: AssetCategory;
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
  targetCondition: AssetCondition;
};

export type RefurbishmentPlan = {
  steps: RefurbishmentStep[];
  fixedCents: number;
  upgradeCents: number;
  totalCents: number;
  usageAfter: { unit: UsageUnit; value: number };
  conditionAfter: AssetCondition;
};

const USAGE_AT_LEAST = /^usage\.value >= (\d+) ([a-z_]+)$/;
const PER_STARTED = /^per started (\d+) ([a-z_]+) since last service$/;

function unitOf(text: string, rule: string): UsageUnit {
  const unit = usageUnitSchema.safeParse(text);
  if (!unit.success) throw new RangeError(`unknown refurbishment rule: ${rule}`);
  return unit.data;
}

/** Turns a `when` text of the data into a rule; throws on any text it does not know. */
export function parseWhenRule(when: string): WhenRule {
  const rule = when.trim();
  if (rule === 'always') return { kind: 'always' };
  const atLeast = USAGE_AT_LEAST.exec(rule);
  if (atLeast) {
    return { kind: 'usage_at_least', value: Number(atLeast[1]), unit: unitOf(atLeast[2]!, rule) };
  }
  const perStarted = PER_STARTED.exec(rule);
  if (perStarted && Number(perStarted[1]) > 0) {
    return {
      kind: 'per_started',
      block: Number(perStarted[1]),
      unit: unitOf(perStarted[2]!, rule),
    };
  }
  throw new RangeError(`unknown refurbishment rule: ${when}`);
}

/** How many times a rule applies to `usage`: 0 or 1, or the started blocks. */
function timesApplied(rule: WhenRule, usage: { unit: UsageUnit; value: number }): number {
  if (rule.kind === 'always') return 1;
  if (rule.unit !== usage.unit) {
    throw new RangeError(`the rule counts ${rule.unit}, the usage is in ${usage.unit}`);
  }
  if (rule.kind === 'usage_at_least') return usage.value >= rule.value ? 1 : 0;
  return Math.ceil(usage.value / rule.block);
}

/** The steps and the cost to bring the item to `targetCondition`. */
export function refurbishmentPlan(
  input: RefurbishmentInput,
  costs: RefurbishmentCosts
): RefurbishmentPlan {
  const { category, condition, usage, targetCondition } = input;
  if (!Number.isSafeInteger(usage.value) || usage.value < 0) {
    throw new RangeError(`usage must be a whole number ≥ 0, got ${usage.value}`);
  }
  const data = costs[category];
  const steps: RefurbishmentStep[] = [];
  let resets = false;

  for (const fixed of data.fixed) {
    const quantity = timesApplied(parseWhenRule(fixed.when), usage);
    if (quantity === 0) continue;
    const resetsUsage = fixed.resets_usage === true;
    resets ||= resetsUsage;
    steps.push({
      kind: 'fixed',
      id: fixed.id,
      costCents: fixed.cost_cents * quantity,
      resetsUsage,
      quantity,
    });
  }
  const fixedCents = steps.reduce((sum, step) => sum + step.costCents, 0);

  const from = CLIMB.indexOf(condition);
  const to = CLIMB.indexOf(targetCondition);
  for (let at = from; at < to; at += 1) {
    const lower = CLIMB[at]!;
    const upper = CLIMB[at + 1]!;
    const id = `${lower}->${upper}`;
    const cost = data.condition_upgrades[id];
    if (cost === undefined) throw new RangeError(`the data has no upgrade ${id} for ${category}`);
    steps.push({ kind: 'upgrade', id, from: lower, to: upper, costCents: cost });
  }
  const upgradeCents = steps.reduce(
    (sum, step) => sum + (step.kind === 'upgrade' ? step.costCents : 0),
    0
  );

  return {
    steps,
    fixedCents,
    upgradeCents,
    totalCents: fixedCents + upgradeCents,
    usageAfter: { unit: usage.unit, value: resets ? 0 : usage.value },
    conditionAfter: to > from ? targetCondition : condition,
  };
}
