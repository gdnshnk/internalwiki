import { MarketingNav } from "@/components/marketing-nav";
import { WaitlistForm } from "@/components/waitlist-form";

export default function PricingPage() {
  return (
    <main className="marketing-shell marketing-shell--premium">
      <MarketingNav />

      <section className="marketing-hero marketing-hero--compact">
        <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
          Pricing
        </p>
        <h1>Pricing for growing teams</h1>
        <p>
          Share your team size and goals. We&apos;ll recommend the right plan and rollout path.
        </p>
      </section>

      <section className="marketing-split">
        <article className="marketing-panel">
          <h3>What is included</h3>
          <ul className="marketing-list">
            <li>Cited, permission-aware summaries</li>
            <li>Slack, Microsoft 365, and Google Workspace integrations</li>
            <li>Automated sync and freshness monitoring</li>
            <li>Security controls and admin visibility</li>
          </ul>
        </article>

        <article className="marketing-panel">
          <h3>Request pricing</h3>
          <p className="surface-sub">Use a work email and we&apos;ll follow up with plan options.</p>
          <WaitlistForm sourcePage="/pricing" />
        </article>
      </section>
    </main>
  );
}
