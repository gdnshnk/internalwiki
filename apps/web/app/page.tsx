import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";

const trustSignals = [
  "Citation-backed answers",
  "Owner, date, and version on every claim",
  "Built for expanding connectors across your stack"
];

export default function MarketingPage() {
  return (
    <main className="marketing-shell marketing-shell--editorial marketing-shell--home">
      <MarketingNav />

      <section className="home-hero home-hero--single">
        <div className="home-hero__copy">
          <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
            Foundational Knowledge Infrastructure
          </p>
          <h1>Search your organization&apos;s decision memory.</h1>
          <p className="home-hero__lede">
            InternalWiki turns scattered workspace knowledge into a traceable answer system with source-level evidence,
            ownership context, and confidence signals your team can audit.
          </p>

          <div className="home-hero__actions">
            <Link href="/pricing" className="ask-submit">
              View pricing
            </Link>
            <Link href="/contact" className="chip">
              Contact team
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

        <aside className="home-hero__artifact" aria-label="Traceability preview">
          <div className="home-artifact">
            <p className="workspace-header__eyebrow">Answer Trace Preview</p>
            <h2>Q: Who approved the latest escalation policy revision?</h2>
            <p className="home-artifact__answer">
              Approved by the Security Operations owner on February 3, 2026, in policy version `sec-escalation-v14`.
            </p>
            <ul className="home-artifact__meta">
              <li>
                <span>Source</span>
                <strong>Policy Repository / Security Escalation Policy</strong>
              </li>
              <li>
                <span>Author</span>
                <strong>N. Patel</strong>
              </li>
              <li>
                <span>Updated</span>
                <strong>2026-02-03</strong>
              </li>
              <li>
                <span>Checksum</span>
                <strong>3f2a...9c1d</strong>
              </li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
