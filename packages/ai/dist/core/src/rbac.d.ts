import type { OrgRole } from "./types";
export declare function hasRoleAtLeast(userRole: OrgRole, minimum: OrgRole): boolean;
export declare function assertOrgAccess(params: {
    sessionOrgId: string;
    targetOrgId: string;
    role: OrgRole;
    minimumRole: OrgRole;
}): void;
//# sourceMappingURL=rbac.d.ts.map