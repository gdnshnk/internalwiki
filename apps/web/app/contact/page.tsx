import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";

export default function ContactPage() {
  return (
    <main className="marketing-shell marketing-shell--premium">
      <MarketingNav />

      <section className="marketing-hero marketing-hero--compact">
        <p className="workspace-header__eyebrow" style={{ margin: 0 }}>
          Contact
        </p>
        <h1>Talk with the InternalWiki team</h1>
        <p>Send your workspace size and rollout timeline. We respond with a direct onboarding path.</p>
      </section>

      <section className="marketing-split marketing-split--equal">
        <article className="marketing-panel">
          <h3>Direct contact</h3>
          <p>
            <a href="mailto:hello@internalwiki.com">hello@internalwiki.com</a>
          </p>
          <p className="surface-sub">Include connector scope, team size, and target launch date.</p>
        </article>

        <article className="marketing-panel">
          <h3>Fastest path</h3>
          <p className="surface-sub">Join the beta waitlist first, then we schedule a short scoping call.</p>
          <Link href="/pricing" className="ask-submit" style={{ marginTop: "0.9rem", display: "inline-flex" }}>
            Go to pricing
          </Link>
        </article>
      </section>
    </main>
  );
}
