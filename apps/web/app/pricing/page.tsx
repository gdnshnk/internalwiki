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
        <h1>Beta access for internal teams</h1>
        <p>
          We are onboarding organizations in guided waves. Use a company email to join the waitlist and we will
          schedule setup.
        </p>
      </section>

      <section className="marketing-split">
        <article className="marketing-panel">
          <h3>What is included</h3>
          <ul className="marketing-list">
            <li>Assistant search with citations and trust score</li>
            <li>Google Workspace + Slack + Microsoft 365 ingestion</li>
            <li>15-minute sync cadence and review queue</li>
            <li>Org isolation and audit trail visibility</li>
          </ul>
        </article>

        <article className="marketing-panel">
          <h3>Join waitlist</h3>
          <p className="surface-sub">Company email required.</p>
          <WaitlistForm sourcePage="/pricing" />
        </article>
      </section>
    </main>
  );
}
