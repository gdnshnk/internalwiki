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

export default function PricingPage() {
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
          <Link href="/app" className="ask-submit">
            Start free
          </Link>
          <Link href="/contact" className="chip">
            Talk to sales
          </Link>
        </div>
      </section>

      <section className="pricing-highlights" aria-label="Pricing highlights">
        <p className="pricing-highlight-pill">Unlimited readers on every plan</p>
        <p className="pricing-highlight-pill">Slack, Microsoft 365, and Google integrations</p>
        <p className="pricing-highlight-pill">Business unlocks SSO, SCIM, and audit controls</p>
      </section>

      <section className="pricing-grid pricing-grid--modern" aria-label="Pricing plans">
        {PUBLIC_PRICING_PLANS.map((plan) => (
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

            <h3>{plan.priceMonthly}</h3>
            <p className="surface-sub pricing-card__summary">{PLAN_POSITIONING[plan.tier].summary}</p>

            <div className="pricing-meta">
              <p className="surface-sub">Annual: {plan.annualPriceMonthlyEquivalent} billed annually</p>
              <p className="surface-sub">Who pays: {plan.whoPays}</p>
              <p className="surface-sub">Included AI: {plan.aiCredits}</p>
              <p className="surface-sub">Overage: {plan.overage}</p>
            </div>

            <ul className="marketing-list pricing-list">
              {plan.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>

            <div className="pricing-card__actions">
              <Link href={plan.tier === "business" ? "/contact" : "/app"} className="ask-submit">
                {plan.tier === "business" ? "Talk to sales" : "Start now"}
              </Link>
            </div>
          </article>
        ))}
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
          <Link href="/contact" className="ask-submit">
            Contact sales
          </Link>
        </div>
      </section>
    </main>
  );
}
