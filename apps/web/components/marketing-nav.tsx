import Link from "next/link";

const marketingLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" }
];

export function MarketingNav() {
  return (
    <header className="marketing-nav">
      <Link href="/" className="marketing-brand">
        <img src="/logo-mark.svg" alt="InternalWiki" className="marketing-brand__logo" />
      </Link>

      <nav className="marketing-nav__links" aria-label="Public navigation">
        {marketingLinks.map((link) => (
          <Link key={link.href} href={link.href} className="marketing-nav__link">
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="marketing-nav__actions">
        <Link href="/app" className="ask-submit">
          Sign in
        </Link>
      </div>
    </header>
  );
}
