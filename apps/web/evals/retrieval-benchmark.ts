import type { RetrievalEvalCase } from "@/lib/retrieval-eval";

export const retrievalBenchmarkCases: RetrievalEvalCase[] = [
  {
    id: "owners-onboarding-policy",
    query: "Who owns onboarding policy approvals this quarter?",
    mode: "ask",
    expectedAnyAnswerPhrases: ["owner", "approval"],
    minCitationCount: 1
  },
  {
    id: "summarize-launch-risks",
    query: "Summarize current launch risks and accountable teams.",
    mode: "summarize",
    expectedAnyAnswerPhrases: ["risk", "team"],
    minCitationCount: 1
  },
  {
    id: "trace-escalation-change",
    query: "Trace where incident severity escalation v14 was approved.",
    mode: "trace",
    expectedAnyAnswerPhrases: ["approved", "version"],
    minCitationCount: 1
  },
  {
    id: "api-dependency-status",
    query: "What are unresolved API dependency blockers from product reviews?",
    mode: "ask",
    expectedAnyAnswerPhrases: ["blocker", "dependency"],
    minCitationCount: 1
  },
  {
    id: "q1-decision-summary",
    query: "Summarize Q1 planning decisions and explicit tradeoffs.",
    mode: "summarize",
    expectedAnyAnswerPhrases: ["decision", "tradeoff"],
    minCitationCount: 1
  },
  {
    id: "trace-pricing-exception",
    query: "Trace who approved the latest pricing exception policy update.",
    mode: "trace",
    expectedAnyAnswerPhrases: ["approved", "policy"],
    minCitationCount: 1
  },
  {
    id: "support-handoff-owners",
    query: "Which teams own support handoff and SLA escalation?",
    mode: "ask",
    expectedAnyAnswerPhrases: ["team", "handoff"],
    minCitationCount: 1
  },
  {
    id: "security-review-summary",
    query: "Summarize the current security review checklist and decision owners.",
    mode: "summarize",
    expectedAnyAnswerPhrases: ["security", "owner"],
    minCitationCount: 1
  },
  {
    id: "trace-soc2-control",
    query: "Trace the source for SOC2 control ownership updates.",
    mode: "trace",
    expectedAnyAnswerPhrases: ["source", "ownership"],
    minCitationCount: 1
  },
  {
    id: "oncall-incident-policy",
    query: "What changed in on-call incident escalation policy this month?",
    mode: "ask",
    expectedAnyAnswerPhrases: ["changed", "policy"],
    minCitationCount: 1
  }
];
