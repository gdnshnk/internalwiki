import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import { WaitlistForm } from "@/components/waitlist-form";
import { PUBLIC_PRICING_PLANS } from "@/lib/billing";

export default function PricingPage() {
  return (
    <main className="marketing-shell marketing-shell--premium">
      <MarketingNav />

      <section className="marketing-hero marketing-hero--compact">
        <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
          Pricing
        </p>
        <h1>Pricing built for adoption and trust</h1>
        <p>
          Pay for creators and admins, not readers. AI summaries are metered with credits, and governance controls
          start on Business.
        </p>
      </section>

      <section className="pricing-grid" aria-label="Pricing plans">
        {PUBLIC_PRICING_PLANS.map((plan) => (
          <article key={plan.tier} className="marketing-panel pricing-card">
            <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
              {plan.tier.toUpperCase()}
            </p>
            <h3>{plan.priceMonthly}</h3>
            <p className="surface-sub">Annual: {plan.annualPriceMonthlyEquivalent} billed annually</p>
            <p className="surface-sub">Who pays: {plan.whoPays}</p>
            <p className="surface-sub">Included AI: {plan.aiCredits}</p>
            <p className="surface-sub">Overage: {plan.overage}</p>
            <ul className="marketing-list">
              {plan.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </article>
        ))}
        <article className="marketing-panel pricing-card pricing-card--enterprise">
          <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
            ENTERPRISE
          </p>
          <h3>Contact sales</h3>
          <p className="surface-sub">Custom contract and governance package.</p>
          <ul className="marketing-list">
            <li>Everything in Business</li>
            <li>Contracted AI pools and overage terms</li>
            <li>Advanced procurement and compliance support</li>
            <li>Custom retention and SLA options</li>
          </ul>
          <Link href="/contact" className="ask-submit" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
            Contact sales
          </Link>
        </article>
      </section>

      <section className="marketing-split">
        <article className="marketing-panel">
          <h3>How billing works</h3>
          <ul className="marketing-list">
            <li>You pay for creators/admins, not readers.</li>
            <li>AI summaries are metered with credits.</li>
            <li>Blocked responses from quality checks consume 0 credits.</li>
            <li>SSO, SCIM, audit export, and compliance controls start at Business.</li>
          </ul>
        </article>
        <article className="marketing-panel">
          <h3>Need a rollout plan?</h3>
          <p className="surface-sub">Share your team size and launch window. We&apos;ll recommend the right tier.</p>
          <WaitlistForm sourcePage="/pricing" />
        </article>
      </section>
    </main>
  );
}
