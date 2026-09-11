import { appendAuditEvent, appendAuditEvents } from "./audit";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents,
  emergencyReserves,
  financialAccounts,
  financingCreditProfiles,
  financingDocuments,
  financingLiabilities,
  financingOffers,
  financingPipelineEvents,
  financingPipelines,
  financingScenarios,
  propertyCandidates,
  propertyGoals,
  idempotencyKeys,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { ensureTenantCore } from "./seed";
import { assertPermission, GovernanceError } from "../domain/governance";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";
import {
  calculateCashToClose,
  calculateDebtMetrics,
  calculateFinancingReadiness,
  calculateMonthlyPayment,
  financingPolicy,
} from "../domain/financing";
import { getFinanceLists, getSafeToDeploy } from "./household-finance";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const today = () => new Date().toISOString().slice(0, 10);
const cents = (value: string | number | null | undefined) => parseMoneyToCents(String(value ?? "0"));
const dateOnly = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value == null ? value : String(value);

function serialize(response: Record<string, unknown>, input: unknown) {
  return JSON.parse(JSON.stringify({ response, fingerprint: JSON.stringify(input) })) as Record<string, unknown>;
}

function replay(row: typeof idempotencyKeys.$inferSelect, operation: string, input: unknown) {
  if (row.operation !== operation || !row.responseBody || row.responseBody.fingerprint !== JSON.stringify(input)) {
    throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different financing request");
  }
  return row.responseBody.response as Record<string, unknown>;
}

async function lockIdempotency(tx: Transaction, householdId: string, operation: string, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${operation}:${householdId}:${key}`}, 0))`);
}

async function withIdempotency<T extends Record<string, unknown>>(
  actor: Actor,
  operation: string,
  key: string,
  input: unknown,
  work: (tx: Transaction) => Promise<T>,
) {
  if (!key || key.length < 8 || key.length > 200) {
    throw new GovernanceError("INVALID_STATE", "An Idempotency-Key header with 8–200 characters is required");
  }
  return db.transaction(async (tx) => {
    await lockIdempotency(tx, actor.householdId, operation, key);
    const [existing] = await tx.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.householdId, actor.householdId),
      eq(idempotencyKeys.key, key),
    )).limit(1);
    if (existing) return replay(existing, operation, input) as T;
    const response = await work(tx);
    await tx.insert(idempotencyKeys).values({
      householdId: actor.householdId,
      key,
      operation,
      responseStatus: 201,
      responseBody: serialize(response, input),
    });
    return response;
  });
}

function liabilityResponse(row: typeof financingLiabilities.$inferSelect) {
  const { householdId: _householdId, createdBy: _createdBy, updatedBy: _updatedBy, ...response } = row;
  return response;
}

function scenarioResponse(row: typeof financingScenarios.$inferSelect) {
  const { householdId: _householdId, ...response } = row;
  return response;
}

async function ensureFinancingDefaults(actor: Actor) {
  await ensureTenantCore(actor.householdId, actor.userId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`financing-seed:${actor.householdId}`}))`);
    const [profile] = await tx.select().from(financingCreditProfiles).where(eq(financingCreditProfiles.householdId, actor.householdId)).limit(1);
    if (!profile) {
      await tx.insert(financingCreditProfiles).values({ householdId: actor.householdId, scoreSource: "not_provided", creditworthinessStatus: "not_assessed" });
    }
    const [pipeline] = await tx.select().from(financingPipelines).where(eq(financingPipelines.householdId, actor.householdId)).limit(1);
    if (!pipeline) {
      const [created] = await tx.insert(financingPipelines).values({
        householdId: actor.householdId,
        stage: "research",
        nextAction: "Confirm financing assumptions before any lender conversation.",
      }).returning();
      await tx.insert(financingPipelineEvents).values({
        householdId: actor.householdId,
        pipelineId: created.id,
        toStage: "research",
        note: "Financing planning workspace initialized.",
      });
    }
    const existingDocuments = await tx.select({ id: financingDocuments.id }).from(financingDocuments).where(eq(financingDocuments.householdId, actor.householdId));
    if (existingDocuments.length === 0) {
      await tx.insert(financingDocuments).values([
        { householdId: actor.householdId, category: "income", name: "Income verification", sensitivity: "sensitive", notes: "Track what would be needed for an eventual human lender conversation." },
        { householdId: actor.householdId, category: "assets", name: "Household asset statements", sensitivity: "sensitive" },
        { householdId: actor.householdId, category: "liabilities", name: "Debt statements", sensitivity: "sensitive" },
        { householdId: actor.householdId, category: "property", name: "Property insurance and tax estimates", sensitivity: "internal" },
      ]);
    }
  });
}

async function availableCash(actor: Actor) {
  const accounts = await db.select({
    balance: financialAccounts.availableBalance,
    fallbackBalance: financialAccounts.currentBalance,
    protected: financialAccounts.protected,
    businessEntityId: financialAccounts.businessEntityId,
    accountType: financialAccounts.accountType,
  }).from(financialAccounts).where(eq(financialAccounts.householdId, actor.householdId));
  const liquid = accounts.filter((account) => ["checking", "savings", "money_market"].includes(account.accountType));
  return {
    availableCents: liquid.reduce((sum, account) => sum + cents(account.balance ?? account.fallbackBalance), 0),
    protectedCents: liquid.filter((account) => account.protected).reduce((sum, account) => sum + cents(account.balance ?? account.fallbackBalance), 0),
    businessCents: liquid.filter((account) => account.businessEntityId !== null).reduce((sum, account) => sum + cents(account.balance ?? account.fallbackBalance), 0),
  };
}

async function candidateForHousehold(actor: Actor, candidateId: string) {
  const [candidate] = await db.select({ candidate: propertyCandidates }).from(propertyCandidates)
    .innerJoin(propertyGoals, eq(propertyGoals.id, propertyCandidates.propertyGoalId))
    .where(and(eq(propertyCandidates.id, candidateId), eq(propertyGoals.householdId, actor.householdId))).limit(1);
  if (!candidate) throw new GovernanceError("INVALID_STATE", "Property candidate was not found in this household");
  return candidate.candidate;
}

export async function getFinancingSnapshot(actor: Actor) {
  assertPermission(actor.role, "read");
  await ensureFinancingDefaults(actor);
  const [profile] = await db.select().from(financingCreditProfiles).where(eq(financingCreditProfiles.householdId, actor.householdId)).limit(1);
  const liabilities = await db.select().from(financingLiabilities).where(eq(financingLiabilities.householdId, actor.householdId)).orderBy(asc(financingLiabilities.name));
  const scenarios = await db.select().from(financingScenarios).where(eq(financingScenarios.householdId, actor.householdId)).orderBy(desc(financingScenarios.updatedAt));
  const offers = await db.select().from(financingOffers).where(eq(financingOffers.householdId, actor.householdId)).orderBy(desc(financingOffers.updatedAt));
  const [pipeline] = await db.select().from(financingPipelines).where(eq(financingPipelines.householdId, actor.householdId)).limit(1);
  const events = pipeline ? await db.select().from(financingPipelineEvents).where(and(
    eq(financingPipelineEvents.householdId, actor.householdId),
    eq(financingPipelineEvents.pipelineId, pipeline.id),
  )).orderBy(desc(financingPipelineEvents.createdAt)) : [];
  const documents = await db.select().from(financingDocuments).where(eq(financingDocuments.householdId, actor.householdId)).orderBy(asc(financingDocuments.category), asc(financingDocuments.name));
  const income = await getFinanceLists();
  const monthlyIncomeCents = income.incomeSources.filter((source) => source.active).reduce((sum, source) => sum + cents(source.expectedMonthly), 0);
  const debtInputs = liabilities.map((liability) => ({
    currentBalanceCents: cents(liability.currentBalance),
    monthlyPaymentCents: cents(liability.monthlyPayment),
    liabilityType: liability.liabilityType,
    creditLimitCents: cents(liability.creditLimit),
    ownership: liability.ownership as "household" | "business",
    status: liability.status,
  }));
  const latestScenario = scenarios[0];
  const metrics = calculateDebtMetrics({
    liabilities: debtInputs,
    monthlyIncomeCents,
    proposedMonthlyPaymentCents: latestScenario ? cents(latestScenario.monthlyPrincipalInterest) : 0,
  });
  const funds = await availableCash(actor);
  const safe = await getSafeToDeploy();
  const cashToClose = latestScenario
    ? calculateCashToClose({
      purchasePriceCents: cents(latestScenario.purchasePrice),
      downPaymentPercent: Number(latestScenario.downPaymentPercent),
      closingCostsCents: cents(latestScenario.closingCosts),
      loanFeesCents: cents(latestScenario.loanFees),
      immediateRepairsCents: 0,
      initialReservesCents: cents(latestScenario.initialReserves),
      availableHouseholdCashCents: funds.availableCents,
      protectedCashCents: funds.protectedCents,
      businessOperatingCashCents: funds.businessCents,
    })
    : calculateCashToClose({
      purchasePriceCents: 0,
      downPaymentPercent: 0,
      closingCostsCents: 0,
      loanFeesCents: 0,
      immediateRepairsCents: 0,
      initialReservesCents: 0,
      availableHouseholdCashCents: funds.availableCents,
      protectedCashCents: funds.protectedCents,
      businessOperatingCashCents: funds.businessCents,
    });
  const readiness = calculateFinancingReadiness({
    metrics,
    score: profile?.score ?? null,
    documentsComplete: documents.filter((document) => document.status === "complete").length,
    documentsTotal: documents.length,
    cashToCloseGapCents: cashToClose.fundingGapCents,
    safeToBorrowCents: cents(safe.safeToDeploy),
  });
  const profileResponse = profile ? {
    ...profile,
    scoreAsOf: dateOnly(profile.scoreAsOf),
    scoreIsNotApproval: true,
  } : null;
  return {
    policy: financingPolicy(),
    creditProfile: profileResponse,
    liabilities: liabilities.map(liabilityResponse),
    scenarios: scenarios.map(scenarioResponse),
    offers: offers.map((offer) => ({
      ...offer,
      expirationDate: dateOnly(offer.expirationDate),
      executionEnabled: false,
    })),
    pipeline: { ...pipeline, events },
    documents: documents.map((document) => ({
      ...document,
      dueDate: dateOnly(document.dueDate),
    })),
    readiness: {
      ...readiness,
      monthlyDebtService: centsToMoney(readiness.monthlyDebtServiceCents),
      monthlyIncome: centsToMoney(readiness.monthlyIncomeCents),
      dtiPercent: readiness.dtiPercent,
      revolvingUtilizationPercent: readiness.revolvingUtilizationPercent,
      propertyDscr: readiness.propertyDscr,
    },
    cashToClose: {
      ...cashToClose,
      uses: centsToMoney(cashToClose.usesCents),
      sources: centsToMoney(cashToClose.sourcesCents),
      eligibleCash: centsToMoney(cashToClose.eligibleCashCents),
      fundingGap: centsToMoney(cashToClose.fundingGapCents),
      protectedCashExcluded: centsToMoney(funds.protectedCents),
      businessOperatingCashExcluded: centsToMoney(funds.businessCents),
    },
    capitalGovernor: {
      safeToBorrow: safe.safeToDeploy,
      rawSafeToBorrow: safe.rawSafeToDeploy,
      confidence: safe.confidence,
      reason: safe.reason,
    },
  };
}

export async function createFinancingLiability(actor: Actor, input: {
  name: string;
  liabilityType: string;
  ownership: "household" | "business";
  businessEntityId?: string;
  currentBalance: string;
  monthlyPayment: string;
  interestRate?: number;
  termMonths?: number;
  remainingTermMonths?: number;
  creditLimit?: string;
  notes?: string;
}, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  if (input.ownership === "business" && !input.businessEntityId) {
    throw new GovernanceError("INVALID_STATE", "Business liabilities require a linked business entity");
  }
  return withIdempotency(actor, "financing_liability.create", idempotencyKey, input, async (tx) => {
    const [row] = await tx.insert(financingLiabilities).values({
      householdId: actor.householdId,
      businessEntityId: input.businessEntityId,
      name: input.name,
      liabilityType: input.liabilityType,
      ownership: input.ownership,
      currentBalance: input.currentBalance,
      originalBalance: input.currentBalance,
      monthlyPayment: input.monthlyPayment,
      interestRate: String(input.interestRate ?? 0),
      termMonths: input.termMonths,
      remainingTermMonths: input.remainingTermMonths,
      creditLimit: input.creditLimit ?? "0.00",
      notes: input.notes,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    }).returning();
    const response = liabilityResponse(row);
    await appendAuditEvent({
      householdId: actor.householdId, eventType: "financing_liability_created", actor: actor.userId,
      entity: "financing_liability", entityId: row.id, afterState: response,
      reason: input.notes ?? "Advisory liability record created",
      metadata: { idempotencyKey, ownership: row.ownership, executionEnabled: false },
    }, tx);
    return response;
  });
}

export async function updateFinancingCreditProfile(actor: Actor, input: {
  score?: number | null;
  scoreSource?: string;
  scoreAsOf?: string;
  scoreConfidence?: string;
  creditworthinessStatus?: string;
  paymentHistoryStatus?: string;
  notes?: string;
}, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  return withIdempotency(actor, "financing_credit_profile.update", idempotencyKey, input, async (tx) => {
    const [existing] = await tx.select().from(financingCreditProfiles).where(eq(financingCreditProfiles.householdId, actor.householdId)).limit(1);
    const [row] = existing
      ? await tx.update(financingCreditProfiles).set({ ...input, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(financingCreditProfiles.id, existing.id)).returning()
      : await tx.insert(financingCreditProfiles).values({ householdId: actor.householdId, ...input, updatedBy: actor.userId }).returning();
    const response = { ...row, scoreIsNotApproval: true };
    await appendAuditEvent({
      householdId: actor.householdId, eventType: "financing_credit_profile_updated", actor: actor.userId,
      entity: "financing_credit_profile", entityId: row.id, afterState: response,
      reason: "Manual planning input updated; no credit pull was performed",
      metadata: { idempotencyKey, provider: "none", approvalClaim: false },
    }, tx);
    return response;
  });
}

export async function createFinancingScenario(actor: Actor, input: {
  name: string;
  propertyCandidateId?: string;
  loanType: string;
  purchasePrice: string;
  downPaymentPercent: number;
  interestRate: number;
  termYears: number;
  mortgageInsurance?: string;
  loanFees?: string;
  closingCosts?: string;
  initialReserves?: string;
}, idempotencyKey: string) {
  assertPermission(actor.role, "recommend");
  const candidate = input.propertyCandidateId ? await candidateForHousehold(actor, input.propertyCandidateId) : undefined;
  return withIdempotency(actor, "financing_scenario.create", idempotencyKey, input, async (tx) => {
    const purchasePriceCents = cents(input.purchasePrice);
    const loanAmountCents = Math.round(purchasePriceCents * (1 - input.downPaymentPercent));
    const monthlyPrincipalInterest = calculateMonthlyPayment({
      principalCents: loanAmountCents,
      annualRatePercent: input.interestRate,
      termMonths: input.termYears * 12,
    });
    const [row] = await tx.insert(financingScenarios).values({
      householdId: actor.householdId,
      propertyCandidateId: input.propertyCandidateId,
      name: input.name,
      loanType: input.loanType,
      purchasePrice: input.purchasePrice,
      downPaymentPercent: String(input.downPaymentPercent),
      interestRate: String(input.interestRate),
      termYears: String(input.termYears),
      mortgageInsurance: input.mortgageInsurance ?? "0.00",
      loanFees: input.loanFees ?? "0.00",
      closingCosts: input.closingCosts ?? "0.00",
      initialReserves: input.initialReserves ?? "0.00",
      loanAmount: centsToMoney(loanAmountCents),
      monthlyPrincipalInterest: centsToMoney(monthlyPrincipalInterest),
      estimatedMonthlyHousingCost: centsToMoney(monthlyPrincipalInterest + cents(input.mortgageInsurance) + Math.round(cents(input.closingCosts) / 12)),
    }).returning();
    const response = { ...scenarioResponse(row), source: candidate ? "linked_property_candidate" : "household_planning" };
    await appendAuditEvent({
      householdId: actor.householdId, eventType: "financing_scenario_created", actor: actor.userId,
      entity: "financing_scenario", entityId: row.id, afterState: response,
      reason: "Illustrative financing scenario created", metadata: { idempotencyKey, lenderSubmission: false },
    }, tx);
    return response;
  });
}

export async function createFinancingOffer(actor: Actor, input: {
  name: string;
  propertyCandidateId?: string;
  lenderLabel?: string;
  programLabel: string;
  loanType: string;
  commitmentStatus: string;
  offerStatus: string;
  loanAmount: string;
  interestRate: number;
  termYears: number;
  estimatedMonthlyPayment: string;
  estimatedCashToClose: string;
  expirationDate?: string;
  assumptions?: Record<string, unknown>;
  notes?: string;
}, idempotencyKey: string) {
  assertPermission(actor.role, "recommend");
  if (input.commitmentStatus === "approved" || input.commitmentStatus === "committed") {
    throw new GovernanceError("INVALID_STATE", "Capital OS records estimates and indications only; lender approval cannot be asserted here");
  }
  if (input.propertyCandidateId) await candidateForHousehold(actor, input.propertyCandidateId);
  return withIdempotency(actor, "financing_offer.create", idempotencyKey, input, async (tx) => {
    const [row] = await tx.insert(financingOffers).values({
      householdId: actor.householdId, propertyCandidateId: input.propertyCandidateId, name: input.name,
      lenderLabel: input.lenderLabel, programLabel: input.programLabel, loanType: input.loanType,
      commitmentStatus: input.commitmentStatus, offerStatus: input.offerStatus, loanAmount: input.loanAmount,
      interestRate: String(input.interestRate), termYears: input.termYears,
      estimatedMonthlyPayment: input.estimatedMonthlyPayment, estimatedCashToClose: input.estimatedCashToClose,
      expirationDate: input.expirationDate, assumptions: input.assumptions ?? {}, notes: input.notes, createdBy: actor.userId,
    }).returning();
    const response = { ...row, executionEnabled: false };
    await appendAuditEvent({
      householdId: actor.householdId, eventType: "financing_offer_recorded", actor: actor.userId,
      entity: "financing_offer", entityId: row.id, afterState: response,
      reason: "Advisory offer or rate indication recorded without lender connectivity",
      metadata: { idempotencyKey, accepted: false, applicationSubmitted: false },
    }, tx);
    return response;
  });
}

export async function createPipelineEvent(actor: Actor, input: { toStage: string; note?: string }, idempotencyKey: string) {
  assertPermission(actor.role, "recommend");
  return withIdempotency(actor, "financing_pipeline.transition", idempotencyKey, input, async (tx) => {
    let [pipeline] = await tx.select().from(financingPipelines).where(eq(financingPipelines.householdId, actor.householdId)).limit(1);
    if (!pipeline) {
      [pipeline] = await tx.insert(financingPipelines).values({ householdId: actor.householdId, stage: "research" }).returning();
    }
    const [event] = await tx.insert(financingPipelineEvents).values({
      householdId: actor.householdId, pipelineId: pipeline.id, fromStage: pipeline.stage, toStage: input.toStage,
      note: input.note, createdBy: actor.userId,
    }).returning();
    await tx.update(financingPipelines).set({ stage: input.toStage, notes: input.note, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(financingPipelines.id, pipeline.id));
    await appendAuditEvent({
      householdId: actor.householdId, eventType: "financing_pipeline_stage_changed", actor: actor.userId,
      entity: "financing_pipeline", entityId: pipeline.id, afterState: { ...event, executionEnabled: false },
      reason: input.note ?? "Advisory financing pipeline stage changed", metadata: { idempotencyKey },
    }, tx);
    return { ...event, executionEnabled: false };
  });
}

export async function updateFinancingDocument(actor: Actor, documentId: string, input: { status: string; notes?: string }, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  return withIdempotency(actor, "financing_document.update", idempotencyKey, { documentId, ...input }, async (tx) => {
    const [row] = await tx.update(financingDocuments).set({ status: input.status, notes: input.notes, updatedAt: new Date() }).where(and(
      eq(financingDocuments.id, documentId), eq(financingDocuments.householdId, actor.householdId),
    )).returning();
    if (!row) throw new GovernanceError("INVALID_STATE", "Financing document requirement was not found");
    await appendAuditEvent({
      householdId: actor.householdId, eventType: "financing_document_updated", actor: actor.userId,
      entity: "financing_document", entityId: row.id, afterState: row,
      reason: "Document readiness status updated", metadata: { idempotencyKey },
    }, tx);
    return row;
  });
}