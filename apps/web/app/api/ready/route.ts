import { jsonOk } from "@/lib/api";
import { evaluateReadiness } from "@/lib/readiness";
import { resolveRequestId, withRequestId } from "@/lib/request-id";

export async function GET(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const payload = await evaluateReadiness();

  return jsonOk(payload, withRequestId(requestId, { status: payload.ready ? 200 : 503 }));
}
