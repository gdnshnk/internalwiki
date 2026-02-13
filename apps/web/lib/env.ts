let validated = false;

export function assertRuntimeEnvSafety(): void {
  if (validated) {
    return;
  }

  const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (isProductionBuildPhase) {
    validated = true;
    return;
  }

  if (process.env.NODE_ENV === "production") {
    const required = ["DATABASE_URL", "INTERNALWIKI_ENCRYPTION_KEY", "INTERNALWIKI_SESSION_SIGNING_KEY"] as const;
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
  }

  validated = true;
}
