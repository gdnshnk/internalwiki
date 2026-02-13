import { jsonError } from "@/lib/api";
import { withRequestId } from "@/lib/request-id";
import { getSessionContext, type SessionContext } from "@/lib/session";

export async function requireSessionContext(requestId: string): Promise<SessionContext | Response> {
  try {
    return await getSessionContext();
  } catch {
    return jsonError("Unauthorized", 401, withRequestId(requestId));
  }
}
