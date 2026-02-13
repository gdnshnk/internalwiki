const roleRank = {
    viewer: 1,
    editor: 2,
    admin: 3,
    owner: 4
};
export function hasRoleAtLeast(userRole, minimum) {
    return roleRank[userRole] >= roleRank[minimum];
}
export function assertOrgAccess(params) {
    if (params.sessionOrgId !== params.targetOrgId) {
        throw new Error("Cross-org access denied");
    }
    if (!hasRoleAtLeast(params.role, params.minimumRole)) {
        throw new Error("Insufficient role");
    }
}
//# sourceMappingURL=rbac.js.map