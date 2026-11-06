// The second life of a returned item (smart problem 3, cards 9 and 10): assess it, pick the
// next customer from the waiting list, refurbish it as the match decides and relist it at its
// second-life price. The numbers are the pure functions' (src/domain/second-life); this file
// reads the rows and the data pack and writes the result in one `withAudit`:
// the `ReturnAssessment` row, the passport's `assessed`, `refurbished` (when the plan has any
// work) and `repriced`, and the asset `available` with its condition and usage after the plan
// (D22). The quote then prices the asset on the assessment's amount (second-life-price.ts).
//
// The inputs of the curve (D60): an item first leased by us (no `previous_lives`, a contract in
// our books) is valued like an exit, from its first contract's list price and start day (D31);
// an item with past lives the pack only counts uses D11's model-year age and the earliest price
// list that has it, the price as new.
import { randomUUID } from 'node:crypto';
import { loadRefurbishmentCosts, loadResidualCurves, loadSecondLifeDemand } from '@/data/load';
import type { Asset, SecondLifeRequest } from '@/data/schemas';
import { returnAssessmentRowSchema } from '@/domain/rows/return-assessment';
import {
  assessReturn,
  firstLeaseListPriceCents,
  type AssessData,
  type AssessInput,
  type ReturnAssessmentResult,
} from '@/domain/second-life/assess';
import { matchDemand, type MatchResult } from '@/domain/second-life/match';
import { ADMIN_ACTOR } from './actor';
import { appendAssetEvent } from './asset-events';
import { AssetNotReturnedError, getAsset, relistReturnedAsset } from './assets';
import { withAudit, type TransactionClient } from './audit';
import { listAssetContracts } from './contracts';
import type { PrismaClient } from './prisma-client';
import { loadPricingData } from './quotes';
import { parseRow } from './row-rules';
import { storedAssessmentSchema, type AssessmentResponse } from './second-life-schemas';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type SecondLifeData = AssessData & { demand: readonly SecondLifeRequest[] };

export async function loadSecondLifeData(): Promise<SecondLifeData> {
  const [curves, costs, pricing, demand] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadPricingData(),
    loadSecondLifeDemand(),
  ]);
  return { curves, costs, pricing, demand };
}

export type SecondLifeProposal = {
  /** The lease it came back from, or null for an item seeded as returned. */
  contractId: string | null;
  input: AssessInput;
  assessment: ReturnAssessmentResult;
  match: MatchResult;
};

export type AssessmentView = SecondLifeProposal & {
  id: string;
  assessedOn: string;
  createdAt: string;
};

export type AssessRefusal =
  | { code: 'admin_only'; params: Record<string, never> }
  | { code: 'asset_not_found'; params: { assetId: string } }
  | { code: 'asset_not_returned'; params: { assetId: string; status: string } }
  | { code: 'no_list_price'; params: { assetId: string } };

type Built = { ok: true; proposal: SecondLifeProposal } | { ok: false; reason: AssessRefusal };

/** The waiting-list entries an earlier assessment already matched (D62): one item each. */
async function matchedDemandIds(db: PrismaClient | TransactionClient): Promise<string[]> {
  const rows = await db.returnAssessment.findMany({
    where: { matched_demand_id: { not: null } },
    select: { matched_demand_id: true },
  });
  return rows.flatMap((row) => (row.matched_demand_id ? [row.matched_demand_id] : []));
}

async function buildProposal(
  db: PrismaClient | TransactionClient,
  asset: Asset,
  today: string,
  data: SecondLifeData
): Promise<Built> {
  const [contracts, taken] = await Promise.all([
    listAssetContracts(db, asset.id),
    matchedDemandIds(db),
  ]);
  const first = contracts[0];
  const ours = asset.previous_lives === 0 && first !== undefined;
  const newPriceCents = ours
    ? first.unitListPriceCents
    : firstLeaseListPriceCents(data.pricing.priceLists, asset.id);
  if (newPriceCents === null) {
    return { ok: false, reason: { code: 'no_list_price', params: { assetId: asset.id } } };
  }
  const input: AssessInput = {
    assetId: asset.id,
    category: asset.category,
    condition: asset.condition,
    usage: asset.usage,
    // D11 counts from the model year whenever the item is not ours from new.
    age: {
      modelYear: asset.model_year,
      previousLives: ours ? 0 : Math.max(1, asset.previous_lives),
      leaseStart: ours ? first.startDate : today,
    },
    newPriceCents,
    isoDate: today,
  };
  const assessment = assessReturn(input, data);
  return {
    ok: true,
    proposal: {
      contractId: contracts.at(-1)?.id ?? null,
      input,
      assessment,
      match: matchDemand(assessment, data.demand, taken),
    },
  };
}

async function returnedAsset(
  db: PrismaClient | TransactionClient,
  assetId: string
): Promise<{ ok: true; asset: Asset } | { ok: false; reason: AssessRefusal }> {
  const asset = await getAsset(db, assetId);
  if (!asset) return { ok: false, reason: { code: 'asset_not_found', params: { assetId } } };
  if (asset.status !== 'returned') {
    return {
      ok: false,
      reason: { code: 'asset_not_returned', params: { assetId, status: asset.status } },
    };
  }
  return { ok: true, asset };
}

/** What an assessment of a returned asset would decide on `today`, without writing. */
export async function previewAssessment(
  db: PrismaClient,
  assetId: string,
  today: string,
  data?: SecondLifeData
): Promise<Built> {
  const found = await returnedAsset(db, assetId);
  if (!found.ok) return found;
  return buildProposal(db, found.asset, today, data ?? (await loadSecondLifeData()));
}

export type AssessResult =
  { ok: true; view: AssessmentView } | { ok: false; reason: AssessRefusal };

/**
 * Assesses a returned asset on `today` and relists it (admin only). One transaction: the
 * assessment row, the passport events and the asset `available` with its new condition and
 * usage; the asset write is conditional on `returned`, so a second click finds it relisted.
 */
export async function assessAsset(
  db: PrismaClient,
  input: { assetId: string; actor: string; today: string },
  data?: SecondLifeData
): Promise<AssessResult> {
  if (input.actor !== ADMIN_ACTOR) return { ok: false, reason: { code: 'admin_only', params: {} } };
  const built = await previewAssessment(db, input.assetId, input.today, data);
  if (!built.ok) return built;
  const { proposal } = built;
  const { assessment, match } = proposal;
  const relist = match.relist;
  const id = randomUUID();

  const row = parseRow('return assessment', returnAssessmentRowSchema, {
    id,
    asset_id: input.assetId,
    contract_id: proposal.contractId,
    assessed_on: input.today,
    condition: assessment.returnedCondition,
    usage_value: proposal.input.usage.value,
    refurbishment_json: JSON.stringify(
      relist.plan.steps.map((s) => ({ step: s.id, cost_cents: s.costCents }))
    ),
    refurbish: relist.upgrade,
    new_condition: relist.condition,
    market_value_cents: relist.marketValue.valueCents,
    second_life_financed_cents: relist.secondLifeFinancedCents,
    matched_demand_id: match.winner?.demandId ?? null,
    match_reasons_json: JSON.stringify(matchReasons(match)),
    assessment_json: JSON.stringify({ input: proposal.input, assessment, match }),
  });

  try {
    const created = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'return_assessment.created',
        entityType: 'return_assessment',
        entityId: id,
        details: {
          assetId: input.assetId,
          decision: match.decision.code,
          newCondition: relist.condition,
          secondLifeFinancedCents: relist.secondLifeFinancedCents,
          matchedDemandId: match.winner?.demandId ?? null,
        },
      },
      async (tx) => {
        const saved = await tx.returnAssessment.create({ data: row });
        const event = { assetId: input.assetId, onDate: input.today } as const;
        await appendAssetEvent(tx, {
          ...event,
          kind: 'assessed',
          details: {
            assessmentId: id,
            condition: assessment.returnedCondition,
            usage: proposal.input.usage,
            matchedDemandId: match.winner?.demandId ?? null,
          },
        });
        if (relist.plan.totalCents > 0) {
          await appendAssetEvent(tx, {
            ...event,
            kind: 'refurbished',
            details: {
              steps: relist.plan.steps.map((s) => s.id),
              costCents: relist.plan.totalCents,
              conditionAfter: relist.condition,
              usageAfter: relist.plan.usageAfter,
            },
          });
        }
        await appendAssetEvent(tx, {
          ...event,
          kind: 'repriced',
          details: {
            marketValueCents: relist.marketValue.valueCents,
            secondLifeFinancedCents: relist.secondLifeFinancedCents,
          },
        });
        // The catalogue's own write (team rule 3): D22's returned → available, D23's parsing.
        await relistReturnedAsset(tx, {
          assetId: input.assetId,
          condition: relist.condition,
          usageValue: relist.plan.usageAfter.value,
        });
        return saved;
      }
    );
    return {
      ok: true,
      view: {
        ...proposal,
        id,
        assessedOn: created.assessed_on,
        createdAt: created.created_at.toISOString(),
      },
    };
  } catch (error) {
    if (!(error instanceof AssetNotReturnedError)) throw error;
    const now = await getAsset(db, input.assetId);
    return {
      ok: false,
      reason: {
        code: 'asset_not_returned',
        params: { assetId: input.assetId, status: now?.status ?? 'unknown' },
      },
    };
  }
}

/** The verdict code of every entry and each candidate's rank step, as `{ code, params }`. */
function matchReasons(match: MatchResult) {
  return [
    ...match.verdicts.map((v) => ({ code: v.outcome.code, params: { demandId: v.demandId } })),
    ...match.ranking.map((r) => ({
      code: 'ranked',
      params: { demandId: r.demandId, rank: r.rank, decidedBy: r.decidedBy ?? 'first' },
    })),
    { code: match.decision.code, params: { condition: match.decision.params.condition } },
  ];
}

/** The latest assessment of an asset, or null. The read the page uses. */
export async function latestAssessment(
  db: PrismaClient | TransactionClient,
  assetId: string
): Promise<AssessmentView | null> {
  const row = await db.returnAssessment.findFirst({
    where: { asset_id: assetId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
  if (!row) return null;
  const parsed = storedAssessmentSchema.safeParse(parseJson(row.assessment_json));
  // An unreadable row (an older build, a hand edit) shows as "not assessed"; its price column
  // still prices the item (second-life-price.ts).
  if (!parsed.success) return null;
  // The schema checks every field the page and the route read; the rest is the domain's shape.
  const stored = parsed.data as unknown as Omit<SecondLifeProposal, 'contractId'>;
  return {
    ...stored,
    contractId: row.contract_id,
    id: row.id,
    assessedOn: row.assessed_on,
    createdAt: row.created_at.toISOString(),
  };
}

/** The route's answer (`assessmentResponseSchema`): the decision, its numbers and its steps. */
export function toAssessmentResponse(view: AssessmentView): AssessmentResponse {
  const { relist, decision, winner, verdicts, ranking } = view.match;
  return {
    id: view.id,
    assetId: view.assessment.assetId,
    contractId: view.contractId,
    assessedOn: view.assessedOn,
    returnedCondition: view.assessment.returnedCondition,
    newCondition: relist.condition,
    refurbish: relist.upgrade,
    marketValueCents: relist.marketValue.valueCents,
    refurbishmentCents: relist.plan.totalCents,
    secondLifeFinancedCents: relist.secondLifeFinancedCents,
    matchedDemandId: winner?.demandId ?? null,
    decision,
    verdicts: verdicts.map((v) => ({ demandId: v.demandId, outcome: v.outcome })),
    ranking: ranking.map((r) => ({
      demandId: r.demandId,
      rank: r.rank,
      decidedBy: r.decidedBy,
      monthlyNetCents: r.monthlyNetCents,
      termMonths: r.termMonths,
    })),
  };
}
