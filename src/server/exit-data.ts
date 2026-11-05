// What an exit needs to be planned, read through each owner's read function (team rule 3):
// the contract (contract slice), the asset (catalogue), the invoices (invoices) and the data
// pack's curves, refurbishment costs, VAT rates and the band's interest rate. Both
// `src/server/exits.ts` (to plan and write) and the invoice handler (to bill the same amount
// from the event inside the transaction) build the plan from here, so they cannot disagree.
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import type {
  Asset,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  VatRates,
} from '@/data/schemas';
import type { PlanExitInput } from '@/domain/exits';
import type { TransactionClient } from './audit';
import { getAsset } from './assets';
import { getContract, type ContractView } from './contracts';
import { listInvoices, type InvoiceView } from './invoices';
import type { PrismaClient } from './prisma-client';

export type ExitData = {
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
  vatRates: VatRates;
  table: CoefficientTable;
};

export async function loadExitData(): Promise<ExitData> {
  const [curves, costs, vatRates, table] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadVatRates(),
    loadCoefficientTable(),
  ]);
  return { curves, costs, vatRates, table };
}

export type ExitContext = { contract: ContractView; asset: Asset; invoices: InvoiceView[] };

/**
 * The contract, its asset and its invoices, or null for an unknown contract. On the client or,
 * inside the exit's transaction, on its `tx`: the owners' read functions accept both.
 */
export async function readExitContext(
  db: PrismaClient | TransactionClient,
  contractId: string
): Promise<ExitContext | null> {
  const contract = await getContract(db, contractId);
  if (!contract) return null;
  const [asset, invoices] = await Promise.all([
    getAsset(db, contract.assetId),
    listInvoices(db, contractId),
  ]);
  if (!asset) throw new Error(`Contract ${contractId} names a missing asset`);
  return { contract, asset, invoices };
}

export type ExitChoice = Pick<
  PlanExitInput,
  'mode' | 'today' | 'reported' | 'reason' | 'nextCustomerId'
>;

/** The pure planner's input from the rows, the data and the customer's choice. */
export function planInputOf(
  context: ExitContext,
  data: ExitData,
  choice: ExitChoice
): PlanExitInput {
  const { contract, asset, invoices } = context;
  const band = data.table.bands.find((b) => b.band === contract.band);
  if (!band) throw new Error(`Contract ${contract.id} has band ${contract.band}, not in the table`);
  return {
    ...choice,
    contract: {
      id: contract.id,
      customerId: contract.customerId,
      assetId: contract.assetId,
      status: contract.status,
      financedCents: contract.financedCents,
      monthlyNetCents: contract.monthlyNetCents,
      termMonths: contract.termMonths,
      buyoutCents: contract.buyoutCents,
      endDate: contract.endDate,
      startDate: contract.startDate,
      unitListPriceCents: contract.unitListPriceCents,
      quantity: contract.quantity,
    },
    invoices: invoices.map((i) => ({ id: i.id, kind: i.kind, status: i.status })),
    asset: {
      category: asset.category,
      modelYear: asset.model_year,
      previousLives: asset.previous_lives,
    },
    annualInterestPercent: band.annual_interest_percent,
    curves: data.curves,
    costs: data.costs,
    vatRates: data.vatRates,
  };
}
