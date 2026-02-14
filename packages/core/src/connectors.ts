import type { ConnectorType } from "./types";

export const ACTIVE_CONNECTOR_TYPES = [
  "google_drive",
  "google_docs",
  "slack",
  "microsoft_teams",
  "microsoft_sharepoint",
  "microsoft_onedrive"
] as const satisfies readonly ConnectorType[];

export const MICROSOFT_CONNECTOR_TYPES = [
  "microsoft_teams",
  "microsoft_sharepoint",
  "microsoft_onedrive"
] as const satisfies readonly ConnectorType[];

export const ACL_ENFORCED_CONNECTOR_TYPES = [
  "slack",
  "microsoft_teams",
  "microsoft_sharepoint",
  "microsoft_onedrive"
] as const satisfies readonly ConnectorType[];

export const GOOGLE_CONNECTOR_TYPES = [
  "google_docs",
  "google_drive"
] as const satisfies readonly ConnectorType[];

export const DEPRECATED_CONNECTOR_TYPE = "notion";
export const NOTION_SUNSET_DAYS = 60;

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  google_docs: "Google Docs",
  google_drive: "Google Drive",
  slack: "Slack",
  microsoft_teams: "Microsoft Teams",
  microsoft_sharepoint: "Microsoft SharePoint",
  microsoft_onedrive: "Microsoft OneDrive"
};

export function isConnectorType(value: string): value is ConnectorType {
  return (ACTIVE_CONNECTOR_TYPES as readonly string[]).includes(value);
}

export function isAclEnforcedConnectorType(value: string): boolean {
  return (ACL_ENFORCED_CONNECTOR_TYPES as readonly string[]).includes(value);
}
