import { createHash } from "node:crypto";
import { z } from "zod";
import type { WaitlistLeadResponse } from "@internalwiki/core";
import { createOrUpdateMarketingWaitlistLead, ensureOrganization } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { writeAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";

const waitlistSchema = z.object({
  email: z.string().trim().email(),
  company: z.string().trim().min(2).max(120),
  role: z.string().trim().max(120).optional(),
  sourcePage: z.string().trim().min(1).max(120).optional(),
  website: z.string().trim().max(200).optional()
});

const freeEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

const marketingOrg = {
  id: "org_public_marketing",
  slug: "public-marketing",
  name: "Public Marketing",
  createdBy: "system"
} as const;

function emailDomain(email: string): string {
  return email.split("@").at(-1)?.toLowerCase() ?? "";
}

function hashIp(ipAddress: string): string {
  return createHash("sha256").update(ipAddress).digest("hex");
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const body = waitlistSchema.safeParse(await request.json());
  if (!body.success) {
    return jsonError(body.error.message, 422, withRequestId(requestId));
  }

  if (body.data.website) {
    const response: WaitlistLeadResponse = {
      ok: true,
      status: "pending",
      message: "Thanks, you are on the beta list."
    };
    return jsonOk(response, withRequestId(requestId));
  }

  const domain = emailDomain(body.data.email);
  if (!domain || freeEmailDomains.has(domain)) {
    return jsonError("Use a company email address to join the beta waitlist.", 422, withRequestId(requestId));
  }

  const client = requestClientMetadata(request);
  const ipAddress = typeof client.ipAddress === "string" && client.ipAddress.length > 0 ? client.ipAddress : "unknown";
  const rateKey = `marketing_waitlist:${domain}:${ipAddress}`;
  const rate = await checkRateLimit({
    key: rateKey,
    windowMs: 60_000,
    maxRequests: 8
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const lead = await createOrUpdateMarketingWaitlistLead({
    email: body.data.email,
    company: body.data.company,
    role: body.data.role,
    sourcePage: body.data.sourcePage ?? "/pricing",
    ipHash: hashIp(ipAddress)
  });

  await ensureOrganization(marketingOrg);
  await writeAuditEvent({
    organizationId: marketingOrg.id,
    actorId: undefined,
    eventType: "marketing.waitlist.submitted",
    entityType: "waitlist_lead",
    entityId: lead.id,
    payload: {
      domain,
      sourcePage: lead.sourcePage,
      requestId
    }
  });

  const response: WaitlistLeadResponse = {
    ok: true,
    status: "pending",
    message: "Thanks, you are on the beta list."
  };

  return jsonOk(response, withRequestId(requestId));
}
