import type { Citation } from "./types";

export const ANSWER_QUALITY_CONTRACT_VERSION = "v1";
export const ANSWER_QUALITY_POLICY_DEFAULTS = {
  groundedness: {
    requireCitations: true,
    minCitationCoverage: 0.8,
    maxUnsupportedClaims: 0
  },
  freshness: {
    windowDays: 30,
    minFreshCitationCoverage: 0.8
  },
  permissionSafety: {
    mode: "fail_closed"
  }
} as const;

export type AnswerQualityDimensionStatus = "passed" | "blocked";

export type AnswerQualityReasonCode =
  | "groundedness.no_citations"
  | "groundedness.low_citation_coverage"
  | "groundedness.unsupported_claims"
  | "freshness.low_fresh_coverage"
  | "freshness.no_fresh_evidence"
  | "permission.missing_viewer_identity"
  | "permission.no_permitted_evidence";

export type AnswerQualityGroundednessResult = {
  status: AnswerQualityDimensionStatus;
  reasons: string[];
  reasonCodes: AnswerQualityReasonCode[];
  metrics: {
    citationCount: number;
    citationCoverage: number;
    unsupportedClaims: number;
  };
};

export type AnswerQualityFreshnessResult = {
  status: AnswerQualityDimensionStatus;
  reasons: string[];
  reasonCodes: AnswerQualityReasonCode[];
  metrics: {
    freshnessWindowDays: number;
    citationCount: number;
    freshCitationCount: number;
    staleCitationCount: number;
    citationFreshnessCoverage: number;
  };
};

export type AnswerQualityPermissionSafetyResult = {
  status: AnswerQualityDimensionStatus;
  reasons: string[];
  reasonCodes: AnswerQualityReasonCode[];
  metrics: {
    candidateCount: number;
    citationCount: number;
    hasViewerPrincipalKeys: boolean;
  };
};

export type AnswerQualityContractResult = {
  version: string;
  status: AnswerQualityDimensionStatus;
  policy: {
    groundedness: {
      requireCitations: boolean;
      minCitationCoverage: number;
      maxUnsupportedClaims: number;
    };
    freshness: {
      windowDays: number;
      minFreshCitationCoverage: number;
    };
    permissionSafety: {
      mode: "fail_closed";
    };
  };
  allowHistoricalEvidence: boolean;
  dimensions: {
    groundedness: AnswerQualityGroundednessResult;
    freshness: AnswerQualityFreshnessResult;
    permissionSafety: AnswerQualityPermissionSafetyResult;
  };
};

export function buildAnswerQualityContract(input: {
  citations: Citation[];
  citationCoverage: number;
  unsupportedClaims: number;
  citationUpdatedAtByChunkId: Map<string, string | undefined>;
  candidateCount: number;
  hasViewerPrincipalKeys: boolean;
  allowHistoricalEvidence?: boolean;
}): AnswerQualityContractResult {
  const policy = ANSWER_QUALITY_POLICY_DEFAULTS;
  const allowHistoricalEvidence = Boolean(input.allowHistoricalEvidence);
  const now = Date.now();

  const groundedReasons: string[] = [];
  const groundedReasonCodes: AnswerQualityReasonCode[] = [];
  if (policy.groundedness.requireCitations && input.citations.length === 0) {
    groundedReasons.push("Citations are required for every answer.");
    groundedReasonCodes.push("groundedness.no_citations");
  }
  if (input.citationCoverage < policy.groundedness.minCitationCoverage) {
    groundedReasons.push(
      `Citation coverage ${input.citationCoverage.toFixed(2)} is below ${policy.groundedness.minCitationCoverage.toFixed(2)}.`
    );
    groundedReasonCodes.push("groundedness.low_citation_coverage");
  }
  if (input.unsupportedClaims > policy.groundedness.maxUnsupportedClaims) {
    groundedReasons.push(`${input.unsupportedClaims} unsupported claim(s) detected.`);
    groundedReasonCodes.push("groundedness.unsupported_claims");
  }

  let freshCitationCount = 0;
  let staleCitationCount = 0;
  const freshnessWindowMs = policy.freshness.windowDays * 24 * 60 * 60 * 1000;
  for (const citation of input.citations) {
    const updatedAt = input.citationUpdatedAtByChunkId.get(citation.chunkId);
    const parsed = updatedAt ? Date.parse(updatedAt) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      staleCitationCount += 1;
      continue;
    }

    if (now - parsed <= freshnessWindowMs) {
      freshCitationCount += 1;
    } else {
      staleCitationCount += 1;
    }
  }

  const freshnessCoverage =
    input.citations.length > 0 ? freshCitationCount / input.citations.length : 0;
  const freshnessReasons: string[] = [];
  const freshnessReasonCodes: AnswerQualityReasonCode[] = [];
  if (!allowHistoricalEvidence) {
    if (input.citations.length === 0 || freshCitationCount === 0) {
      freshnessReasons.push("No fresh evidence found within the freshness window.");
      freshnessReasonCodes.push("freshness.no_fresh_evidence");
    } else if (freshnessCoverage < policy.freshness.minFreshCitationCoverage) {
      freshnessReasons.push(
        `Fresh evidence coverage ${freshnessCoverage.toFixed(2)} is below ${policy.freshness.minFreshCitationCoverage.toFixed(2)}.`
      );
      freshnessReasonCodes.push("freshness.low_fresh_coverage");
    }
  }

  const permissionReasons: string[] = [];
  const permissionReasonCodes: AnswerQualityReasonCode[] = [];
  if (!input.hasViewerPrincipalKeys) {
    permissionReasons.push("User identity mapping is required for permission-safe retrieval.");
    permissionReasonCodes.push("permission.missing_viewer_identity");
  } else if (input.candidateCount === 0 || input.citations.length === 0) {
    permissionReasons.push("No permitted evidence was available for this request.");
    permissionReasonCodes.push("permission.no_permitted_evidence");
  }

  const groundedness: AnswerQualityGroundednessResult = {
    status: groundedReasons.length === 0 ? "passed" : "blocked",
    reasons: groundedReasons,
    reasonCodes: groundedReasonCodes,
    metrics: {
      citationCount: input.citations.length,
      citationCoverage: input.citationCoverage,
      unsupportedClaims: input.unsupportedClaims
    }
  };

  const freshness: AnswerQualityFreshnessResult = {
    status: freshnessReasons.length === 0 ? "passed" : "blocked",
    reasons: freshnessReasons,
    reasonCodes: freshnessReasonCodes,
    metrics: {
      freshnessWindowDays: policy.freshness.windowDays,
      citationCount: input.citations.length,
      freshCitationCount,
      staleCitationCount,
      citationFreshnessCoverage: freshnessCoverage
    }
  };

  const permissionSafety: AnswerQualityPermissionSafetyResult = {
    status: permissionReasons.length === 0 ? "passed" : "blocked",
    reasons: permissionReasons,
    reasonCodes: permissionReasonCodes,
    metrics: {
      candidateCount: input.candidateCount,
      citationCount: input.citations.length,
      hasViewerPrincipalKeys: input.hasViewerPrincipalKeys
    }
  };

  const status: AnswerQualityDimensionStatus =
    groundedness.status === "blocked" ||
    freshness.status === "blocked" ||
    permissionSafety.status === "blocked"
      ? "blocked"
      : "passed";

  return {
    version: ANSWER_QUALITY_CONTRACT_VERSION,
    status,
    policy: {
      groundedness: {
        requireCitations: policy.groundedness.requireCitations,
        minCitationCoverage: policy.groundedness.minCitationCoverage,
        maxUnsupportedClaims: policy.groundedness.maxUnsupportedClaims
      },
      freshness: {
        windowDays: policy.freshness.windowDays,
        minFreshCitationCoverage: policy.freshness.minFreshCitationCoverage
      },
      permissionSafety: {
        mode: policy.permissionSafety.mode
      }
    },
    allowHistoricalEvidence,
    dimensions: {
      groundedness,
      freshness,
      permissionSafety
    }
  };
}
