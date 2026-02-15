import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import { PUBLIC_PRICING_PLANS } from "@/lib/billing";

const PLAN_POSITIONING = {
  free: {
    label: "Get started",
    summary: "For smaller teams validating value quickly."
  },
  pro: {
    label: "Most popular",
    summary: "For teams that need daily usage and faster rollout."
  },
  business: {
    label: "Governance ready",
    summary: "For organizations that need advanced security and admin controls."
  }
} as const;

export default async function PricingPage({
  searchParams
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const resolvedSearch = await searchParams;
  const billingCycle = resolvedSearch.billing === "annual" ? "annual" : "monthly";

  return (
    <main className="marketing-shell marketing-shell--premium">
      <MarketingNav />

      <section className="marketing-hero marketing-hero--compact pricing-hero">
        <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
          Pricing
        </p>
        <h1>Simple pricing that scales with your team</h1>
        <p>
          Start free, pay for creators and admins as you grow, and upgrade governance when your security requirements
          expand.
        </p>
        <div className="marketing-hero__actions">
          <Link href="/app" className="ask-submit marketing-cta">
            Start free
          </Link>
          <Link href="/contact" className="chip marketing-chip">
            Talk to sales
          </Link>
        </div>
      </section>

      <section className="pricing-cycle-toggle" aria-label="Billing cycle">
        <Link
          href="/pricing?billing=monthly"
          className={`chip pricing-cycle-chip ${billingCycle === "monthly" ? "pricing-cycle-chip--active" : ""}`}
        >
          Monthly
        </Link>
        <Link
          href="/pricing?billing=annual"
          className={`chip pricing-cycle-chip ${billingCycle === "annual" ? "pricing-cycle-chip--active" : ""}`}
        >
          Annual
        </Link>
      </section>

      <section className="pricing-grid pricing-grid--modern" aria-label="Pricing plans">
        {PUBLIC_PRICING_PLANS.map((plan) => {
          const displayPrice = billingCycle === "annual" ? plan.annualPriceMonthlyEquivalent : plan.priceMonthly;
          const billingLabel = billingCycle === "annual" ? "Billed annually" : "Billed monthly";
          return (
            <article
              key={plan.tier}
              className={`marketing-panel pricing-card pricing-card--modern ${plan.tier === "pro" ? "pricing-card--featured" : ""}`}
            >
              <div className="pricing-card__top">
                <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
                  {plan.tier.toUpperCase()}
                </p>
                <span className={`pricing-badge ${plan.tier === "pro" ? "pricing-badge--featured" : ""}`}>
                  {PLAN_POSITIONING[plan.tier].label}
                </span>
              </div>

              <h3>{displayPrice}</h3>
              <p className="surface-sub pricing-card__summary">{PLAN_POSITIONING[plan.tier].summary}</p>

              <ul className="pricing-facts" aria-label={`${plan.tier} pricing details`}>
                <li>
                  <span>Billing</span>
                  <strong>{billingLabel}</strong>
                </li>
                <li>
                  <span>Who pays</span>
                  <strong>{plan.whoPays}</strong>
                </li>
                <li>
                  <span>Included AI</span>
                  <strong>{plan.aiCredits}</strong>
                </li>
                <li>
                  <span>Overage</span>
                  <strong>{plan.overage}</strong>
                </li>
              </ul>

              <ul className="marketing-list pricing-list">
                {plan.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>

              <div className="pricing-card__actions">
                <Link href={plan.tier === "business" ? "/contact" : "/app"} className="ask-submit marketing-cta">
                  {plan.tier === "business" ? "Talk to sales" : "Start now"}
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      <section className="marketing-panel pricing-enterprise-panel">
        <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
          ENTERPRISE
        </p>
        <h3>Custom plans for procurement and compliance</h3>
        <p className="surface-sub">
          Built for larger deployments that need custom terms, onboarding support, and expanded governance.
        </p>
        <div className="pricing-card__actions">
          <Link href="/contact" className="ask-submit marketing-cta">
            Contact sales
          </Link>
        </div>
      </section>
    </main>
  );
}
