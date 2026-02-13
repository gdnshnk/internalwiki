import { describe, expect, test } from "vitest";
import { assertOrgAccess, hasRoleAtLeast } from "../src/rbac";

describe("rbac", () => {
  test("validates role hierarchy", () => {
    expect(hasRoleAtLeast("owner", "editor")).toBe(true);
    expect(hasRoleAtLeast("viewer", "admin")).toBe(false);
  });

  test("throws on cross-org access", () => {
    expect(() =>
      assertOrgAccess({
        sessionOrgId: "org-a",
        targetOrgId: "org-b",
        role: "owner",
        minimumRole: "viewer"
      })
    ).toThrow(/Cross-org/);
  });
});
