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

    const weak = ["INTERNALWIKI_ENCRYPTION_KEY", "INTERNALWIKI_SESSION_SIGNING_KEY"].filter((key) => {
      const value = process.env[key];
      return !value || value.trim().length < 16;
    });
    if (weak.length > 0) {
      throw new Error(`Unsafe production environment variables (must be >=16 chars): ${weak.join(", ")}`);
    }
  }

  validated = true;
}
