function redact(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (/bearer\s+|token|secret|password|authorization/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = /token|secret|password|authorization/i.test(key) ? "[REDACTED]" : redact(entry);
    }
    return result;
  }

  return value;
}

export function safeInfo(message: string, context?: Record<string, unknown>): void {
  if (!context) {
    console.info(message);
    return;
  }

  console.info(message, redact(context));
}

export function safeError(message: string, context?: Record<string, unknown>): void {
  if (!context) {
    console.error(message);
    return;
  }

  console.error(message, redact(context));
}
