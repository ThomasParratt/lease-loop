// Leaving a contract: buy out, return or pass on, at the end of the term or early (D14, D16).
// `previewExit` plans on the request's day and writes nothing. `exitContract` plans the same
// way and writes it in one `withAudit`: the contract's status and end day through the contract
// slice's `endContract` (the row parsed, a conditional write on `active`, so a second exit finds
// nothing to change), then one event emitted on the same `tx`. The handlers do the other
// slices' parts: the invoices bill the exit and cancel the unpaid rents, the catalogue sets the
// asset `sold` or `returned` (D22), the passport writes its entry. A handler that throws
// rolls the whole exit back.
import type { AssetCondition, UsageUnit } from '@/data/schemas';
import { planExit, type ExitMode, type ExitRefusal, type PlannedExit } from '@/domain/exits';
import { ADMIN_ACTOR } from './actor';
import { withAudit } from './audit';
import { endContract, type ContractView } from './contracts';
import { getCustomer } from './customers';
import { emit } from './events';
import './event-handlers';
import {
  loadExitData,
  planInputOf,
  readExitContext,
  type ExitChoice,
  type ExitContext,
  type ExitData,
} from './exit-data';
import type { PrismaClient } from './prisma-client';

export type ExitServiceRefusal =
  | ExitRefusal
  | { code: 'contract_not_found'; params: { contractId: string } }
  | { code: 'not_allowed'; params: { contractId: string } }
  | { code: 'next_customer_not_found'; params: { customerId: string } };

/** The plan as the API and the page see it (exit-schemas.ts `exitPreviewResponseSchema`). */
export type ExitPreview = {
  today: string;
  mode: ExitMode;
  reason: PlannedExit['reason'];
  atOrAfterEnd: boolean;
  status: PlannedExit['status'];
  monthsPaid: number;
  buy: PlannedExit['cost']['buy'];
  return: PlannedExit['cost']['return'];
  invoice: PlannedExit['invoice'];
  cancelInvoiceIds: string[];
};

export type PreviewExitResult =
  { ok: true; preview: ExitPreview } | { ok: false; reason: ExitServiceRefusal };

export type ExitContractResult =
  | { ok: true; contract: ContractView; plan: ExitPreview }
  | { ok: false; reason: ExitServiceRefusal };

function toPreview(plan: PlannedExit, today: string): ExitPreview {
  return {
    today,
    mode: plan.mode,
    reason: plan.reason,
    atOrAfterEnd: plan.cost.atOrAfterEnd,
    status: plan.status,
    monthsPaid: plan.cost.monthsPaid,
    buy: plan.cost.buy,
    return: plan.cost.return,
    invoice: plan.invoice,
    cancelInvoiceIds: plan.cancelInvoiceIds,
  };
}

type Reported = { condition: AssetCondition; usage: { unit: UsageUnit; value: number } };

async function plan(
  db: PrismaClient,
  contractId: string,
  choice: Omit<ExitChoice, 'reported'> & { reported?: Reported; context?: ExitContext },
  data?: ExitData
) {
  const { context: known, ...rest } = choice;
  const context = known ?? (await readExitContext(db, contractId));
  if (!context) {
    return { ok: false, reason: { code: 'contract_not_found', params: { contractId } } } as const;
  }
  const reported = rest.reported ?? {
    condition: context.asset.condition,
    usage: context.asset.usage,
  };
  const input = planInputOf(context, data ?? (await loadExitData()), { ...rest, reported });
  return { ...planExit(input), context } as const;
}

/**
 * What an exit on `today` would do, without writing. The condition and usage default to the
 * catalogue's last known values; the route checks who may see it.
 */
export async function previewExit(
  db: PrismaClient,
  /** `context`: the rows the caller has already read, so they are not read twice. */
  input: { contractId: string; mode: ExitMode; reported?: Reported; context?: ExitContext },
  today: string,
  data?: ExitData
): Promise<PreviewExitResult> {
  const planned = await plan(db, input.contractId, { ...input, today }, data);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  return { ok: true, preview: toPreview(planned.plan, today) };
}

export type ExitContractInput = {
  contractId: string;
  mode: ExitMode;
  reason?: string;
  reported: Reported;
  nextCustomerId?: string;
  actor: string;
};

/** Thrown inside the transaction when another exit changed the contract first. */
class LostExitRace extends Error {}

/** Leaves the contract on `today`: only its customer or `admin`. One audited transaction. */
export async function exitContract(
  db: PrismaClient,
  input: ExitContractInput,
  today: string,
  data?: ExitData
): Promise<ExitContractResult> {
  const { contractId, actor } = input;
  const context = await readExitContext(db, contractId);
  if (!context)
    return { ok: false, reason: { code: 'contract_not_found', params: { contractId } } };
  if (actor !== context.contract.customerId && actor !== ADMIN_ACTOR) {
    return { ok: false, reason: { code: 'not_allowed', params: { contractId } } };
  }
  if (input.nextCustomerId && !(await getCustomer(db, input.nextCustomerId))) {
    return {
      ok: false,
      reason: { code: 'next_customer_not_found', params: { customerId: input.nextCustomerId } },
    };
  }

  const planned = await plan(db, contractId, { ...input, today, context }, data);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  const exit = planned.plan;
  const notActive = {
    ok: false,
    reason: { code: 'contract_not_active', params: { status: exit.status } },
  } as const;

  try {
    const row = await withAudit(
      db,
      {
        actor,
        action: `contract.${exit.mode === 'buy' ? 'bought_out' : exit.mode === 'return' ? 'returned' : 'passed_on'}`,
        entityType: 'contract',
        entityId: contractId,
        details: {
          mode: exit.mode,
          reason: exit.reason,
          status: exit.status,
          endedOn: exit.endedOn,
          invoice: exit.invoice,
          cancelledRents: exit.cancelInvoiceIds.length,
          nextCustomerId: input.nextCustomerId ?? null,
        },
      },
      async (tx) => {
        // The contract slice's operation: the row parsed (D27), written only while active.
        const ended = await endContract(tx, {
          id: contractId,
          status: exit.status,
          endedOn: exit.endedOn,
        });
        if (!ended) throw new LostExitRace();
        await emit(tx, exit.event);
        return ended;
      }
    );
    return { ok: true, contract: row, plan: toPreview(exit, today) };
  } catch (error) {
    if (error instanceof LostExitRace) {
      const now = await readExitContext(db, contractId);
      return {
        ...notActive,
        reason: { ...notActive.reason, params: { status: now?.contract.status ?? exit.status } },
      };
    }
    throw error;
  }
}
