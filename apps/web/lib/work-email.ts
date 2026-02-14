const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "qq.com",
  "zoho.com",
  "fastmail.com",
  "me.com"
]);

function parseDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[1]) {
    return null;
  }
  return parts[1];
}

export function isWorkEmailAddress(email: string): boolean {
  const domain = parseDomain(email);
  if (!domain) {
    return false;
  }

  if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
    return false;
  }

  if (domain.endsWith(".local") || domain === "localhost") {
    return false;
  }

  return domain.includes(".");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

