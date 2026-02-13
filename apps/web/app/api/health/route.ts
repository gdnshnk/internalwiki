import { jsonOk } from "@/lib/api";
import { resolveRequestId, withRequestId } from "@/lib/request-id";

export async function GET(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);

  return jsonOk(
    {
      status: "ok",
      service: "@internalwiki/web",
      environment: process.env.NODE_ENV ?? "development",
      version: process.env.INTERNALWIKI_VERSION ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime())
    },
    withRequestId(requestId)
  );
}
