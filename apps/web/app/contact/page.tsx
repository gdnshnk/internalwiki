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
        <h1>Talk with our team</h1>
        <p>Tell us your goals, timeline, and integration needs. We will help you choose the right rollout path.</p>
      </section>

      <section className="marketing-split marketing-split--equal">
        <article className="marketing-panel">
          <h3>Email</h3>
          <p>
            <a href="mailto:hello@internalwiki.com">hello@internalwiki.com</a>
          </p>
          <p className="surface-sub">Include team size, key integrations, and your target launch date.</p>
        </article>

        <article className="marketing-panel">
          <h3>Need pricing first?</h3>
          <p className="surface-sub">Send a quick request and we&apos;ll share plan options.</p>
          <Link href="/pricing" className="ask-submit" style={{ marginTop: "0.9rem", display: "inline-flex" }}>
            View pricing
          </Link>
        </article>
      </section>
    </main>
  );
}
