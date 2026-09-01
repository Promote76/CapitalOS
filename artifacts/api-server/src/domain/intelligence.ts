export type IntelligencePriority = "critical" | "high" | "medium" | "low" | "informational";
export type IntelligenceDataQuality = "high" | "medium" | "low";

export type SpecialistSignal = {
  analyst: string;
  scope: string;
  summary: string;
  confidence: number;
  dataQuality: IntelligenceDataQuality;
  evidence: string[];
};

export type CioRecommendation = {
  analyst: "AI CIO";
  priority: IntelligencePriority;
  recommendation: string;
  reason: string;
  evidence: string[];
  expectedBenefit: string;
  potentialDownside: string;
  impactOnDuplexGoal: string;
  impactOnHouseholdLiquidity: string;
  riskLevel: "low" | "moderate" | "high";
  confidence: number;
  dataQuality: IntelligenceDataQuality;
  requiredApproval: string;
  suggestedNextAction: string;
};

export type IntelligenceInputs = {
  safeToDeployCents: number;
  emergencyReserveMonths: number;
  emergencyReserveTargetMonths: number;
  propertyReadinessScore: number;
  propertyGovernorStatus: "pass" | "review" | "blocked";
  propertyCandidateCount: number;
  financeAnomalyCount: number;
  freeCashFlowCents: number;
  savingsRate: number;
  riskState: "normal" | "review" | "locked";
  emergencyStopActive: boolean;
  strategyCount: number;
  strategyConfidence: number;
  confidenceScore: number;
};

export function dataQualityFromConfidence(confidence: number, missingSignals = 0): IntelligenceDataQuality {
  if (missingSignals > 1 || confidence < 60) return "low";
  if (missingSignals > 0 || confidence < 80) return "medium";
  return "high";
}

export function calculateCioRecommendation(input: IntelligenceInputs): CioRecommendation {
  const evidence = [
    `Safe-to-Deploy: $${(input.safeToDeployCents / 100).toFixed(2)}`,
    `Emergency reserve: ${input.emergencyReserveMonths.toFixed(1)} of ${input.emergencyReserveTargetMonths} months`,
    `Property readiness: ${input.propertyReadinessScore}/100`,
  ];
  const quality = dataQualityFromConfidence(input.confidenceScore, input.propertyCandidateCount === 0 ? 1 : 0);

  if (input.emergencyStopActive || input.riskState === "locked") {
    return {
      analyst: "AI CIO",
      priority: "critical",
      recommendation: "Pause new capital activity until the Risk Governor is reviewed.",
      reason: "The household risk state is locked, so stability and capital protection take precedence over growth.",
      evidence: [...evidence, "Risk Governor: locked or emergency stop active"],
      expectedBenefit: "Prevents new activity while the hard safeguard is engaged.",
      potentialDownside: "Growth and optional investments wait until a human review is complete.",
      impactOnDuplexGoal: "No change to protected duplex capital.",
      impactOnHouseholdLiquidity: "Preserves available liquidity.",
      riskLevel: "high",
      confidence: input.confidenceScore,
      dataQuality: quality,
      requiredApproval: "Owner review required before resuming activity.",
      suggestedNextAction: "Review the Risk Governor and document the reason for the lock.",
    };
  }

  if (input.safeToDeployCents <= 0 || input.propertyGovernorStatus === "blocked") {
    return {
      analyst: "AI CIO",
      priority: "high",
      recommendation: "Maintain the current allocation and do not deploy additional capital.",
      reason: "The Capital Governor has no safe discretionary room, and the current property gate is blocked.",
      evidence: [...evidence, "Capital Governor: $0 safe discretionary room", `Property Governor: ${input.propertyGovernorStatus}`],
      expectedBenefit: "Keeps required obligations, emergency liquidity, and protected duplex capital intact.",
      potentialDownside: "The household may take longer to fund optional strategies or advance the property search.",
      impactOnDuplexGoal: "Preserves the current $200 weekly duplex contribution path.",
      impactOnHouseholdLiquidity: "Positive; no new discretionary deployment is recommended.",
      riskLevel: "moderate",
      confidence: Math.max(72, input.confidenceScore),
      dataQuality: quality,
      requiredApproval: "None for maintaining the existing plan.",
      suggestedNextAction: input.financeAnomalyCount > 0
        ? "Review uncategorized or unusual household transactions before changing allocation."
        : "Continue the current contribution rhythm and collect the next missing property or lender document.",
    };
  }

  if (input.emergencyReserveMonths < input.emergencyReserveTargetMonths || input.financeAnomalyCount > 0) {
    return {
      analyst: "AI CIO",
      priority: "medium",
      recommendation: "Strengthen household liquidity before increasing investment or property commitments.",
      reason: "The household has room to review, but reserve coverage or transaction quality is not yet at the preferred level.",
      evidence: [...evidence, `${input.financeAnomalyCount} finance items need review`],
      expectedBenefit: "Improves confidence in the next capital decision without changing hard policies.",
      potentialDownside: "Optional growth may be deferred while the household closes the information gap.",
      impactOnDuplexGoal: "Keep the protected contribution unchanged.",
      impactOnHouseholdLiquidity: "Improves liquidity quality and reduces avoidable surprises.",
      riskLevel: "moderate",
      confidence: input.confidenceScore,
      dataQuality: quality,
      requiredApproval: "Owner approval required for any allocation increase.",
      suggestedNextAction: input.financeAnomalyCount > 0 ? "Review the flagged transactions." : "Build the emergency reserve toward its configured target.",
    };
  }

  return {
    analyst: "AI CIO",
    priority: "low",
    recommendation: "Maintain the current allocation and review the plan on its normal cadence.",
    reason: "Household cash flow, reserve coverage, and the current capital posture support the existing plan.",
    evidence: [...evidence, `Free cash flow: $${(input.freeCashFlowCents / 100).toFixed(2)}/month`, `Savings rate: ${input.savingsRate.toFixed(1)}%`],
    expectedBenefit: "Keeps the plan consistent while more evidence accumulates.",
    potentialDownside: "A deliberately patient plan may move more slowly than an aggressive allocation.",
    impactOnDuplexGoal: "No change to the protected duplex contribution path.",
    impactOnHouseholdLiquidity: "Maintains the current liquidity posture.",
    riskLevel: "low",
    confidence: input.confidenceScore,
    dataQuality: quality,
    requiredApproval: "None for maintaining the existing plan.",
    suggestedNextAction: "No allocation change required; complete the next scheduled household review.",
  };
}

export function calculateContributionScenario(input: {
  currentWeeklyCents: number;
  proposedWeeklyCents: number;
  remainingGoalCents: number;
}) {
  const currentWeeks = input.currentWeeklyCents > 0 ? Math.ceil(input.remainingGoalCents / input.currentWeeklyCents) : null;
  const proposedWeeks = input.proposedWeeklyCents > 0 ? Math.ceil(input.remainingGoalCents / input.proposedWeeklyCents) : null;
  return {
    currentWeeks,
    proposedWeeks,
    weeksEarlier: currentWeeks !== null && proposedWeeks !== null ? Math.max(0, currentWeeks - proposedWeeks) : null,
    weeklyChangeCents: input.proposedWeeklyCents - input.currentWeeklyCents,
  };
}