import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";

const trustSignals = [
  "Groundedness enforced: uncited or unsupported answers are blocked",
  "Freshness enforced: recent evidence required by default",
  "Permission safety enforced across Slack, Microsoft 365, and Google Workspace"
];

export default function MarketingPage() {
  return (
    <main className="marketing-shell marketing-shell--editorial marketing-shell--home">
      <MarketingNav />

      <section className="home-hero home-hero--single">
        <div className="home-hero__copy">
          <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
            Trusted AI For Company Knowledge
          </p>
          <h1>Get clear answers from your company knowledge.</h1>
          <p className="home-hero__lede">
            InternalWiki connects your tools and returns cited summaries only when quality checks pass.
          </p>

          <div className="home-hero__actions">
            <Link href="/pricing" className="ask-submit">
              See pricing
            </Link>
            <Link href="/contact" className="chip">
              Talk to sales
            </Link>
          </div>

          <div className="home-trust-strip" role="list" aria-label="Core trust signals">
            {trustSignals.map((signal) => (
              <p key={signal} role="listitem" className="home-trust-strip__item">
                {signal}
              </p>
            ))}
          </div>
        </div>

        <aside className="home-hero__artifact" aria-label="Answer preview">
          <div className="home-artifact">
            <p className="workspace-header__eyebrow">Answer preview</p>
            <h2>Q: What changed in the customer escalation policy this quarter?</h2>
            <p className="home-artifact__answer">
              The latest update adds a 24-hour executive escalation path and clarifies ownership between Support and
              Security.
            </p>
            <ul className="home-artifact__meta">
              <li>
                <span>Source</span>
                <strong>Security Escalation Policy</strong>
              </li>
              <li>
                <span>Owner</span>
                <strong>Security Operations</strong>
              </li>
              <li>
                <span>Updated</span>
                <strong>Feb 3, 2026</strong>
              </li>
              <li>
                <span>Evidence</span>
                <strong>3 supporting sources</strong>
              </li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
