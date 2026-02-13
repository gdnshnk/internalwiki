import { assertOrgAccess, type OrgRole } from "@internalwiki/core";
import type { SessionContext } from "./session";

export function assertScopedOrgAccess(params: {
  session: SessionContext;
  targetOrgId: string;
  minimumRole: OrgRole;
}): void {
  assertOrgAccess({
    sessionOrgId: params.session.organizationId,
    targetOrgId: params.targetOrgId,
    role: params.session.role,
    minimumRole: params.minimumRole
  });
}
