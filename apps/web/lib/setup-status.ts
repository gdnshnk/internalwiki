import {
  countDocumentsByOrganization,
  getAclCoverageByConnector,
  listConnectorAccounts,
  listUserSourceIdentityKeys
} from "@internalwiki/db";

const ACL_CONNECTOR_TYPES = new Set([
  "slack",
  "microsoft_teams",
  "microsoft_sharepoint",
  "microsoft_onedrive"
]);

export type SetupStatus = {
  readyToAsk: boolean;
  steps: {
    connected: boolean;
    firstSyncComplete: boolean;
    permissionMappingComplete: boolean;
    aiReady: boolean;
  };
  blockers: string[];
  stats: {
    connectors: number;
    indexedDocuments: number;
    identityKeys: number;
    aclCoverage: {
      documents: number;
      covered: number;
    };
  };
};

export async function getSetupStatus(input: {
  organizationId: string;
  userId: string;
  userEmail: string;
}): Promise<SetupStatus> {
  const [connectors, indexedDocuments, identityKeys, aclCoverage] = await Promise.all([
    listConnectorAccounts(input.organizationId),
    countDocumentsByOrganization(input.organizationId),
    listUserSourceIdentityKeys({ organizationId: input.organizationId, userId: input.userId }),
    getAclCoverageByConnector(input.organizationId)
  ]);

  const hasAclConnectors = connectors.some((connector) => ACL_CONNECTOR_TYPES.has(connector.connectorType));
  const aclDocs = aclCoverage.reduce((acc, entry) => acc + entry.documents, 0);
  const aclCovered = aclCoverage.reduce((acc, entry) => acc + entry.aclCovered, 0);

  const steps = {
    connected: connectors.length > 0,
    firstSyncComplete: indexedDocuments > 0,
    permissionMappingComplete: !hasAclConnectors || identityKeys.length > 0,
    aiReady: Boolean(process.env.OPENAI_API_KEY)
  };

  const blockers: string[] = [];
  if (!steps.connected) {
    blockers.push("Connect at least one source before asking questions.");
  }
  if (!steps.firstSyncComplete) {
    blockers.push("Run initial sync so evidence is indexed.");
  }
  if (!steps.permissionMappingComplete) {
    blockers.push("Map your account to source identities to unlock permission-aware retrieval.");
  }
  if (!steps.aiReady) {
    blockers.push("Configure OPENAI_API_KEY to enable answer generation.");
  }

  return {
    readyToAsk: blockers.length === 0,
    steps,
    blockers,
    stats: {
      connectors: connectors.length,
      indexedDocuments,
      identityKeys: identityKeys.length,
      aclCoverage: {
        documents: aclDocs,
        covered: aclCovered
      }
    }
  };
}
