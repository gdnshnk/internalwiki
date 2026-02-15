import type { PlanTier } from "@internalwiki/core";
import {
  getOrgEntitlements as getOrgEntitlementsRecord,
  getOrganizationBillingUsage
} from "@internalwiki/db";
import { jsonError } from "@/lib/api";

export type OrgEntitlements = Awaited<ReturnType<typeof getOrgEntitlementsRecord>>;
export type OrgBillingUsage = Awaited<ReturnType<typeof getOrganizationBillingUsage>>;

export type BusinessFeature =
  | "sso"
  | "scim"
  | "auditExport"
  | "compliancePosture"
  | "domainInviteControls"
  | "advancedPermissionsDiagnostics";

const BUSINESS_FEATURE_LABELS: Record<BusinessFeature, string> = {
  sso: "SAML single sign-on",
  scim: "SCIM provisioning",
  auditExport: "Audit export",
  compliancePosture: "Compliance posture",
  domainInviteControls: "Domain and invite controls",
  advancedPermissionsDiagnostics: "Advanced access checks"
};

const PLAN_ORDER: PlanTier[] = ["free", "pro", "business", "enterprise"];

export const PUBLIC_PRICING_PLANS = [
  {
    tier: "free" as const,
    priceMonthly: "$0",
    annualPriceMonthlyEquivalent: "$0",
    whoPays: "Up to 3 creator seats",
    aiCredits: "100 credits per workspace / month",
    overage: "$0.30 / credit",
    highlights: [
      "Unlimited readers",
      "Cited summaries and core search",
      "Up to 2 integrations",
      "Daily sync",
      "Basic support"
    ]
  },
  {
    tier: "pro" as const,
    priceMonthly: "$12 / Creator",
    annualPriceMonthlyEquivalent: "$10 / Creator",
    whoPays: "Creator seats only",
    aiCredits: "250 credits per paid creator / month (pooled)",
    overage: "$0.25 / credit",
    highlights: [
      "Unlimited readers",
      "Slack, Microsoft 365, and Google connectors",
      "Auto-sync",
      "Answer quality standards",
      "Role-based access controls"
    ]
  },
  {
    tier: "business" as const,
    priceMonthly: "$24 / Creator",
    annualPriceMonthlyEquivalent: "$20 / Creator",
    whoPays: "Creator seats only",
    aiCredits: "500 credits per paid creator / month (pooled)",
    overage: "$0.18 / credit",
    highlights: [
      "Everything in Pro",
      "SAML SSO and SCIM",
      "Audit export and compliance reporting",
      "Domain and invite controls",
      "Advanced access checks"
    ]
  }
];

export async function getOrgEntitlements(orgId: string): Promise<OrgEntitlements> {
  return getOrgEntitlementsRecord(orgId);
}

export async function getOrgBillingUsage(orgId: string, period?: { from?: string; to?: string }): Promise<OrgBillingUsage> {
  return getOrganizationBillingUsage({
    organizationId: orgId,
    periodStart: period?.from,
    periodEnd: period?.to
  });
}

export function isBusinessFeatureEnabled(entitlements: OrgEntitlements, feature: BusinessFeature): boolean {
  return entitlements.features[feature];
}

export function isTierAtLeast(input: { current: PlanTier; minimum: PlanTier }): boolean {
  return PLAN_ORDER.indexOf(input.current) >= PLAN_ORDER.indexOf(input.minimum);
}

export async function requireBusinessFeature(input: {
  organizationId: string;
  feature: BusinessFeature;
  requestId: string;
}): Promise<Response | null> {
  const entitlements = await getOrgEntitlements(input.organizationId);
  if (isBusinessFeatureEnabled(entitlements, input.feature)) {
    return null;
  }

  return jsonError(
    `${BUSINESS_FEATURE_LABELS[input.feature]} is available on Business and Enterprise plans.`,
    402,
    {
      headers: {
        "x-request-id": input.requestId
      }
    }
  );
}
