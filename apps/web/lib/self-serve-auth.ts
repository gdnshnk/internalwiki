import { randomUUID } from "node:crypto";
import {
  addOrganizationDomain,
  createMembership,
  createOrUpdateUser,
  ensureOrganization,
  getPrimaryMembership,
  getUserByEmail,
  resolveMembership
} from "@internalwiki/db";
import { normalizeEmail } from "@/lib/work-email";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function domainCompanyName(domain: string): string {
  const root = domain.split(".")[0] ?? "workspace";
  const title = root
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  return title.length > 0 ? `${title} Workspace` : "InternalWiki Workspace";
}

export async function registerSelfServeUser(input: {
  email: string;
  displayName: string;
}): Promise<{
  userId: string;
  organizationId: string;
  role: "owner";
  email: string;
}> {
  const email = normalizeEmail(input.email);
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    const existingMembership = await getPrimaryMembership(existingUser.id);
    if (existingMembership) {
      throw new Error("An account already exists for this email. Use Sign in.");
    }
  }

  const userId = existingUser?.id ?? `user_pwd_${randomUUID()}`;
  const domain = email.split("@")[1] ?? "workspace.local";
  const slugBase = slugify(domain.split(".")[0] ?? "workspace") || "workspace";
  const orgSlug = `${slugBase}-${randomUUID().slice(0, 6)}`;
  const organizationId = `org_${randomUUID().replace(/-/g, "").slice(0, 18)}`;

  await ensureOrganization({
    id: organizationId,
    name: domainCompanyName(domain),
    slug: orgSlug,
    createdBy: userId
  });

  await createOrUpdateUser({
    id: userId,
    email,
    displayName: input.displayName
  });

  await createMembership({
    organizationId,
    userId,
    role: "owner",
    createdBy: userId
  });

  await addOrganizationDomain({
    organizationId,
    domain,
    verifiedAt: new Date().toISOString(),
    createdBy: userId
  });

  return {
    userId,
    organizationId,
    role: "owner",
    email
  };
}

export async function resolveUserMembershipByEmail(email: string): Promise<{
  userId: string;
  organizationId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  email: string;
} | null> {
  const normalized = normalizeEmail(email);
  const user = await getUserByEmail(normalized);
  if (!user) {
    return null;
  }

  const membership = await resolveMembership({
    userId: user.id
  });
  if (!membership) {
    return null;
  }

  return {
    userId: membership.userId,
    organizationId: membership.organizationId,
    role: membership.role,
    email: membership.email
  };
}

