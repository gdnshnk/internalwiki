import { AuthLoginActions } from "@/components/auth-login-actions";
import { normalizeNextPath } from "@/lib/auth-next";

const requiredEnvKeys = [
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI"
] as const;

function missingRequiredEnv(): string[] {
  return requiredEnvKeys.filter((key) => !process.env[key]);
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; intent?: "login" | "register" }>;
}) {
  const resolvedSearch = await searchParams;
  const nextPath = normalizeNextPath(resolvedSearch.next ?? "/app");
  const missing = missingRequiredEnv();
  const isDev = process.env.NODE_ENV !== "production";
  const canUseGoogle = missing.length === 0;
  const canUseBootstrap = Boolean(process.env.DATABASE_URL);
  const defaultIntent = resolvedSearch.intent === "register" ? "register" : "login";

  return (
    <main className="page-wrap" style={{ width: "min(900px, calc(100% - 2rem))", margin: "2rem auto" }}>
      <AuthLoginActions
        nextPath={nextPath}
        showDevBootstrap={isDev}
        canUseGoogle={canUseGoogle}
        canUseBootstrap={canUseBootstrap}
        authErrorCode={resolvedSearch.error}
        defaultIntent={defaultIntent}
      />

      {missing.length > 0 ? (
        <section className="surface-card">
          <p className="workspace-header__eyebrow">Setup required</p>
          <h2 className="surface-title">Local environment checklist</h2>
          <p className="surface-sub">
            `/app` needs a configured database and OAuth settings. Set the following variables and restart the web server.
          </p>

          <div className="data-grid" style={{ marginTop: "0.8rem" }}>
            {requiredEnvKeys.map((envKey) => (
              <div key={envKey} className="data-pill">
                {missing.includes(envKey) ? "Missing" : "Configured"}: <code>{envKey}</code>
              </div>
            ))}
          </div>

          <pre
            style={{
              marginTop: "0.9rem",
              padding: "0.8rem",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "var(--surface-muted)",
              overflowX: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem"
            }}
          >
{`cp .env.example .env
npm run db:migrate
npm run dev:web`}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
