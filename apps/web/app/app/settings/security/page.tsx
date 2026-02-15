import {
  getAnswerQualityContractSummary,
  getOrCreateUserMemoryProfile,
  getOrCreateSessionPolicy,
  listUserMemoryEntries,
  listAuditExportJobs,
  verifyAuditEventIntegrity
} from "@internalwiki/db";
import { SecuritySettingsManager } from "@/components/security-settings-manager";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SecuritySettingsPage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Fsettings%2Fsecurity");
  }
  try {
    assertScopedOrgAccess({
      session,
      targetOrgId: session.organizationId,
      minimumRole: "admin"
    });
  } catch {
    redirect("/app");
  }

  const [policy, jobs, integrity, contract, memoryProfile, memoryEntries] = await Promise.all([
    getOrCreateSessionPolicy(session.organizationId),
    listAuditExportJobs(session.organizationId, 20),
    verifyAuditEventIntegrity({ organizationId: session.organizationId, limit: 500 }),
    getAnswerQualityContractSummary(session.organizationId),
    getOrCreateUserMemoryProfile({
      organizationId: session.organizationId,
      userId: session.userId,
      createdBy: session.userId
    }),
    listUserMemoryEntries({
      organizationId: session.organizationId,
      userId: session.userId,
      limit: 25
    })
  ]);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Security</p>
        <h1 className="surface-title">Enterprise trust controls</h1>
        <p className="surface-sub">
          Manage session hardening and audit export jobs for compliance, incident response, and access governance.
        </p>
      </section>

      <SecuritySettingsManager
        orgId={session.organizationId}
        initialPolicy={policy}
        initialJobs={jobs}
        initialIntegrity={integrity}
        initialContract={contract}
        initialMemoryProfile={memoryProfile}
        initialMemoryEntries={memoryEntries}
      />
    </main>
  );
}
