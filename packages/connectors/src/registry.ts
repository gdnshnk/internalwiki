import type { ConnectorType } from "@internalwiki/core";
import type { WorkspaceConnector } from "./types";
import { GoogleWorkspaceConnector } from "./google";
import { SlackConnector } from "./slack";
import {
  MicrosoftOneDriveConnector,
  MicrosoftSharePointConnector,
  MicrosoftTeamsConnector
} from "./microsoft";

export function getConnector(type: ConnectorType): WorkspaceConnector {
  switch (type) {
    case "google_drive":
    case "google_docs":
      return new GoogleWorkspaceConnector();
    case "slack":
      return new SlackConnector();
    case "microsoft_teams":
      return new MicrosoftTeamsConnector();
    case "microsoft_sharepoint":
      return new MicrosoftSharePointConnector();
    case "microsoft_onedrive":
      return new MicrosoftOneDriveConnector();
    default:
      throw new Error(`Unsupported connector type: ${type}`);
  }
}
