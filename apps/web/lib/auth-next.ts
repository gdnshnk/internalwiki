const DEFAULT_NEXT_PATH = "/app";

export function normalizeNextPath(input: string | null | undefined): string {
  if (!input) {
    return DEFAULT_NEXT_PATH;
  }

  const decoded = decodeURIComponent(input).trim();
  if (!decoded.startsWith("/") || decoded.startsWith("//")) {
    return DEFAULT_NEXT_PATH;
  }

  if (decoded === "/app" || decoded.startsWith("/app/")) {
    return decoded;
  }

  return DEFAULT_NEXT_PATH;
}
