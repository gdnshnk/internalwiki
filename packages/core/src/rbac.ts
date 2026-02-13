import type { OrgRole } from "./types";

const roleRank: Record<OrgRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4
};

export function hasRoleAtLeast(userRole: OrgRole, minimum: OrgRole): boolean {
  return roleRank[userRole] >= roleRank[minimum];
}

export function assertOrgAccess(params: {
  sessionOrgId: string;
  targetOrgId: string;
  role: OrgRole;
  minimumRole: OrgRole;
}): void {
  if (params.sessionOrgId !== params.targetOrgId) {
    throw new Error("Cross-org access denied");
  }

  if (!hasRoleAtLeast(params.role, params.minimumRole)) {
    throw new Error("Insufficient role");
  }
}
