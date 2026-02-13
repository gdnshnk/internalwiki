import { checkAndIncrementApiRateLimit } from "@internalwiki/db";

export async function checkRateLimit(input: {
  key: string;
  windowMs: number;
  maxRequests: number;
}): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const result = await checkAndIncrementApiRateLimit({
    bucketKey: input.key,
    windowMs: input.windowMs,
    maxRequests: input.maxRequests
  });

  return {
    allowed: result.allowed,
    retryAfterMs: result.retryAfterMs
  };
}
