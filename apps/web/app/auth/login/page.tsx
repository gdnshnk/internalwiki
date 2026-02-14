import { AuthLoginActions } from "@/components/auth-login-actions";
import { normalizeNextPath } from "@/lib/auth-next";

const requiredEnvKeys = ["DATABASE_URL"] as const;
const googleEnvKeys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"] as const;

function missingRequiredEnv(): string[] {
  return requiredEnvKeys.filter((key) => !process.env[key]);
}

function missingGoogleEnv(): string[] {
  return googleEnvKeys.filter((key) => !process.env[key]);
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; intent?: "login" | "register" }>;
}) {
  const resolvedSearch = await searchParams;
  const nextPath = normalizeNextPath(resolvedSearch.next ?? "/app");
  const missing = missingRequiredEnv();
  const missingGoogle = missingGoogleEnv();
  const isDev = process.env.NODE_ENV !== "production";
  const canUseGoogle = missingGoogle.length === 0;
  const canUsePassword = missing.length === 0;
  const canUseBootstrap = Boolean(process.env.DATABASE_URL);
  const defaultIntent = resolvedSearch.intent === "register" ? "register" : "login";

  return (
    <main className="auth-page">
      <AuthLoginActions
        nextPath={nextPath}
        showDevBootstrap={isDev}
        canUseGoogle={canUseGoogle}
        canUsePassword={canUsePassword}
        canUseBootstrap={canUseBootstrap}
        authErrorCode={resolvedSearch.error}
        defaultIntent={defaultIntent}
      />

      {isDev && missing.length > 0 ? (
        <section className="surface-card auth-setup-card">
          <p className="workspace-header__eyebrow">Local setup</p>
          <h2 className="surface-title">Development environment checklist</h2>
          <p className="surface-sub">
            This appears only in local development. Configure your environment variables, then restart the web server.
          </p>

          <div className="data-grid auth-setup-grid">
            {requiredEnvKeys.map((envKey) => (
              <div key={envKey} className="data-pill">
                {missing.includes(envKey) ? "Missing" : "Configured"}: <code>{envKey}</code>
              </div>
            ))}
            {googleEnvKeys.map((envKey) => (
              <div key={envKey} className="data-pill">
                {missingGoogle.includes(envKey) ? "Optional for Google SSO" : "Configured"}: <code>{envKey}</code>
              </div>
            ))}
          </div>

          <pre className="auth-setup-command">
{`cp .env.example .env
npm run db:migrate
npm run dev:web`}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
