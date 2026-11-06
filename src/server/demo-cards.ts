// The scenario card runner behind the demo page's buttons (docs/features/demo-cards.md): each
// of the ten cards of CHALLENGE.md section 4 as data (its customer, item, term, down payment,
// days and exit), run through the same services the routes call, each with the card's day as
// `today` and the card's customer as the actor, so every write goes through withAudit and the
// audit page shows the run. The outputs are whatever those services return: nothing below knows
// a card's numbers (AGENTS.md rule 7). A card that already ran is refused and linked (D70).
import { loadCustomers } from '@/data/load';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { ADMIN_ACTOR } from './actor';
import { createApplication, listApplications, type ApplicationView } from './applications';
import { getAsset } from './assets';
import { contractIdOfApplication, getContract, signContract } from './contracts';
import {
  demoCardSchema,
  type DemoCard,
  type DemoCardId,
  type DemoCardInput,
  type DemoCardRun,
  type DemoStep,
} from './demo-cards-schemas';
import { previewExit } from './exits';
import { listInvoices, payInvoice } from './invoices';
import type { PrismaClient } from './prisma-client';
import { createQuote, getQuote, loadPricingData } from './quotes';

const AINO_EBIKE_36 = {
  customerId: 'cust-aino',
  assetId: 'ebike-003',
  termMonths: 36,
  quoteOn: '2026-11-05',
};

/** The ten cards' inputs (CHALLENGE.md section 4); `clock` is the day the judges look. */
const CARD_INPUTS: readonly DemoCardInput[] = [
  { id: 1, run: 'sign', clock: '2026-11-05', trip: AINO_EBIKE_36, signOn: '2026-11-05' },
  {
    id: 2,
    run: 'sign',
    clock: '2026-11-06',
    trip: { customerId: 'cust-aino', assetId: 'laptop-004', termMonths: 36, quoteOn: '2026-11-05' },
    signOn: '2026-11-06',
  },
  {
    id: 3,
    run: 'sign',
    clock: '2027-01-01',
    trip: { customerId: 'cust-aino', assetId: 'ebike-001', termMonths: 24, quoteOn: '2026-09-15' },
    signOn: '2026-09-15',
  },
  {
    id: 4,
    run: 'sign',
    clock: '2026-02-01',
    trip: { customerId: 'cust-aino', assetId: 'laptop-001', termMonths: 36, quoteOn: '2026-01-31' },
    signOn: '2026-01-31',
  },
  {
    id: 5,
    run: 'apply',
    clock: '2026-11-05',
    trip: {
      customerId: 'cust-mikko',
      assetId: 'laptop-008',
      termMonths: 36,
      quoteOn: '2026-11-05',
    },
  },
  {
    id: 6,
    run: 'apply',
    clock: '2026-11-05',
    trip: {
      customerId: 'cust-norvi',
      assetId: 'ebike-004',
      quantity: 4,
      termMonths: 36,
      quoteOn: '2026-11-05',
    },
  },
  {
    id: 7,
    run: 'apply',
    clock: '2026-11-05',
    trip: {
      customerId: 'cust-haapala',
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
      quoteOn: '2026-11-05',
    },
  },
  {
    id: 8,
    run: 'exit_preview',
    clock: '2027-06-05',
    trip: AINO_EBIKE_36,
    signOn: '2026-11-05',
    rentsPaid: 7,
    exit: { mode: 'buy', condition: 'good', usage: { unit: 'km', value: 1_800 } },
  },
  {
    id: 9,
    run: 'asset',
    clock: '2026-11-05',
    actor: ADMIN_ACTOR,
    assetId: 'ebike-007',
    page: 'asset',
  },
  {
    id: 10,
    run: 'asset',
    clock: '2026-11-05',
    actor: ADMIN_ACTOR,
    assetId: 'ebike-008',
    page: 'passport',
  },
];

export const DEMO_CARDS: readonly DemoCard[] = CARD_INPUTS.map((card) =>
  demoCardSchema.parse(card)
);

export function demoCard(id: DemoCardId): DemoCard {
  const card = DEMO_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`no demo card ${id}`);
  return card;
}

/** Who the judge acts as after the run: the card's customer, or the actor it names. */
export function demoCardActor(card: DemoCard): string {
  return card.run === 'asset' ? card.actor : card.trip.customerId;
}

export type DemoCardRefusal =
  | { code: 'card_already_run'; params: { cardId: number } }
  | { code: 'card_step_refused'; params: { cardId: number; step: string; reason: string } };

export type RunDemoCardResult =
  | { ok: true; run: DemoCardRun }
  | {
      ok: false;
      reason: DemoCardRefusal;
      today: string;
      actor: string;
      /** The records the earlier run left, for `card_already_run`; null otherwise. */
      landing: string | null;
    };

type Trip = Extract<DemoCard, { trip: unknown }>['trip'];
type Earlier = { application: ApplicationView; contractId: string | null };

/** Thrown inside a run when a service refuses; turned into `card_step_refused`. */
class StepRefused extends Error {
  constructor(
    readonly step: string,
    readonly reason: string
  ) {
    super(`${step}: ${reason}`);
  }
}

/**
 * The application an earlier run of `trip` left (or one made by hand on the same deal): same
 * customer, item, quantity, term, down payment and quote day. A signed one wins over an
 * unsigned one, so a stray second application never hides the contract.
 */
async function earlierRun(db: PrismaClient, trip: Trip): Promise<Earlier | null> {
  let unsigned: Earlier | null = null;
  for (const application of await listApplications(db, { customerId: trip.customerId })) {
    const quote = await getQuote(db, application.quoteId);
    const deal = quote?.breakdown;
    const same =
      quote?.quoteDate === trip.quoteOn &&
      deal?.assetId === trip.assetId &&
      deal.quantity === trip.quantity &&
      deal.termMonths === trip.termMonths &&
      deal.downPaymentCents === trip.downPaymentCents;
    if (!same) continue;
    const contractId = await contractIdOfApplication(db, application.id);
    if (contractId) return { application, contractId };
    unsigned ??= { application, contractId: null };
  }
  return unsigned;
}

/**
 * The contract a signing card works on: the earlier run's, an approved earlier application
 * signed now (a run stopped before signing picks up where it stopped), or a new quote,
 * application and signature. Null when an earlier application cannot be signed (not approved).
 */
async function contractFor(
  db: PrismaClient,
  card: Extract<DemoCard, { signOn: string }>,
  earlier: Earlier | null,
  steps: DemoStep[]
): Promise<string | null> {
  if (earlier?.contractId) return earlier.contractId;
  if (earlier) {
    if (earlier.application.decision !== 'approved') return null;
    steps.push({
      code: 'application_reused',
      params: { decision: earlier.application.decision, date: earlier.application.decidedOn },
      href: `/applications/${earlier.application.id}`,
    });
    return sign(db, earlier.application, card.signOn, steps);
  }
  const application = await quoteAndApply(db, card.trip, steps);
  return sign(db, application, card.signOn, steps);
}

function landingOf(earlier: Earlier): string {
  return earlier.contractId
    ? `/contracts/${earlier.contractId}`
    : `/applications/${earlier.application.id}`;
}

/** Quote and application on the trip's quote day, as its customer; the steps they took. */
async function quoteAndApply(db: PrismaClient, trip: Trip, steps: DemoStep[]) {
  const quoted = await createQuote(
    db,
    {
      assetId: trip.assetId,
      quantity: trip.quantity,
      termMonths: trip.termMonths,
      downPaymentCents: trip.downPaymentCents,
      today: trip.quoteOn,
      actor: trip.customerId,
    },
    await loadPricingData()
  );
  if (!quoted.ok) throw new StepRefused('quote', quoted.reason.code);
  const { breakdown } = quoted.quote;
  steps.push({
    code: 'quote_created',
    params: {
      assetId: trip.assetId,
      quantity: trip.quantity,
      termMonths: trip.termMonths,
      downPaymentCents: trip.downPaymentCents,
      monthlyNetCents: breakdown.monthlyNetCents,
      priceListVersion: breakdown.priceListVersion,
      date: trip.quoteOn,
    },
    href: `/apply/${quoted.quote.id}`,
  });

  const customer = (await loadCustomers()).find((c) => c.id === trip.customerId);
  if (!customer) throw new StepRefused('application', 'customer_not_found');
  const applied = await createApplication(db, {
    quoteId: quoted.quote.id,
    customerId: trip.customerId,
    answers: { ...answersFromCustomer(customer), ...trip.answers },
    today: trip.quoteOn,
    actor: trip.customerId,
  });
  if (!applied.ok) throw new StepRefused('application', applied.reason);
  const { application } = applied;
  steps.push({
    code: 'application_decided',
    params: { decision: application.decision, date: application.decidedOn },
    href: `/applications/${application.id}`,
  });
  for (const reason of application.reasons) {
    steps.push({ code: 'application_reason', params: { ...reason.params, reason: reason.code } });
  }
  return application;
}

/** Signs on `signOn` as the customer; the contract's id. */
async function sign(
  db: PrismaClient,
  application: ApplicationView,
  signOn: string,
  steps: DemoStep[]
): Promise<string> {
  const signed = await signContract(
    db,
    { applicationId: application.id, actor: application.customerId },
    signOn,
    await loadPricingData()
  );
  if (!signed.ok) throw new StepRefused('signing', signed.reason.code);
  const { contract, priceLock } = signed.details;
  steps.push({
    code: 'contract_signed',
    params: {
      number: contract.number,
      monthlyNetCents: contract.monthlyNetCents,
      startDate: contract.startDate,
      endDate: contract.endDate,
      date: signOn,
    },
    href: `/contracts/${contract.id}`,
  });
  if (priceLock) steps.push({ code: priceLock.code, params: priceLock.params });
  return contract.id;
}

/** Pays the first rents, each on its due day, until `count` are paid; how many it paid now. */
async function payRentsUpTo(db: PrismaClient, contractId: string, count: number, actor: string) {
  const rents = (await listInvoices(db, contractId)).filter((i) => i.kind === 'rent');
  const toPay = rents.slice(0, count).filter((i) => i.status !== 'paid');
  for (const rent of toPay) {
    const paid = await payInvoice(db, { id: rent.id, paidOn: rent.dueDate, actor });
    if (!paid.ok) throw new StepRefused('payment', paid.reason);
  }
  return { paidNow: toPay.length, grossCents: toPay.reduce((sum, i) => sum + i.grossCents, 0) };
}

/**
 * Cards 9 and 10, the extension point: what runs on a returned item before the judge lands on
 * its page. Today the item is already `returned` in the data pack and main has no assessment
 * yet, so it only says where things stand; the second-life slice's `assessAsset` plugs in here
 * once it is merged (docs/features/demo-cards.md, open questions).
 */
export async function afterReturn(db: PrismaClient, card: DemoCard): Promise<DemoStep[]> {
  if (card.run !== 'asset') return [];
  const asset = await getAsset(db, card.assetId);
  if (!asset) throw new StepRefused('asset', 'asset_not_found');
  return [
    {
      code: 'asset_status',
      params: { assetId: asset.id, status: asset.status, condition: asset.condition },
      href: `/assets/${asset.id}`,
    },
  ];
}

type Ran = { steps: DemoStep[]; landing: string } | { alreadyRun: string };

async function runSteps(db: PrismaClient, card: DemoCard): Promise<Ran> {
  const steps: DemoStep[] = [];
  if (card.run === 'asset') {
    steps.push(...(await afterReturn(db, card)));
    const landing =
      card.page === 'passport' ? `/assets/${card.assetId}/passport` : `/assets/${card.assetId}`;
    return { steps, landing };
  }

  const earlier = await earlierRun(db, card.trip);
  if (card.run === 'apply') {
    if (earlier) return { alreadyRun: landingOf(earlier) };
    const application = await quoteAndApply(db, card.trip, steps);
    return { steps, landing: `/applications/${application.id}` };
  }
  if (card.run === 'sign' && earlier?.contractId) return { alreadyRun: landingOf(earlier) };

  const contractId = await contractFor(db, card, earlier, steps);
  if (!contractId) return { alreadyRun: landingOf(earlier!) };
  const landing = `/contracts/${contractId}`;
  if (card.run === 'sign') return { steps, landing };

  // Card 8 builds on card 1's contract. Paying is idempotent and the preview writes nothing,
  // so a repeat run only shows the preview again; an ended contract has no preview.
  if (earlier?.contractId) steps.push({ code: 'contract_reused', params: {}, href: landing });
  const contract = await getContract(db, contractId);
  if (contract?.status !== 'active') return { alreadyRun: landing };
  const actor = card.trip.customerId;
  const { paidNow, grossCents } = await payRentsUpTo(db, contractId, card.rentsPaid, actor);
  if (paidNow > 0) steps.push({ code: 'rents_paid', params: { count: paidNow, grossCents } });

  const reported = { condition: card.exit.condition, usage: card.exit.usage };
  const preview = await previewExit(db, { contractId, mode: card.exit.mode, reported }, card.clock);
  if (!preview.ok) throw new StepRefused('exit_preview', preview.reason.code);
  steps.push({
    code: 'exit_previewed',
    params: {
      monthsPaid: preview.preview.monthsPaid,
      buyTotalCents: preview.preview.buy.totalCents,
      returnTotalCents: preview.preview.return.totalCents,
      date: card.clock,
    },
    href: landing,
  });
  return { steps, landing };
}

/**
 * Runs card `cardId` and says what it did. The caller sets the demo clock to `today` and the
 * actor cookie to `actor` in both outcomes, so the landing link opens as the judges expect.
 */
export async function runDemoCard(
  db: PrismaClient,
  cardId: DemoCardId
): Promise<RunDemoCardResult> {
  const card = demoCard(cardId);
  const today = card.clock;
  const actor = demoCardActor(card);
  try {
    const ran = await runSteps(db, card);
    if ('alreadyRun' in ran) {
      const reason = { code: 'card_already_run', params: { cardId } } as const;
      return { ok: false, reason, today, actor, landing: ran.alreadyRun };
    }
    return { ok: true, run: { cardId, today, actor, ...ran } };
  } catch (error) {
    if (!(error instanceof StepRefused)) throw error;
    const params = { cardId, step: error.step, reason: error.reason };
    return {
      ok: false,
      reason: { code: 'card_step_refused', params },
      today,
      actor,
      landing: null,
    };
  }
}
