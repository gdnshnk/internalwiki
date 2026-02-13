import type { ConnectorType } from "@internalwiki/core";
import type { WorkspaceConnector } from "./types";
import { GoogleWorkspaceConnector } from "./google";
import { NotionConnector } from "./notion";

export function getConnector(type: ConnectorType): WorkspaceConnector {
  switch (type) {
    case "google_drive":
    case "google_docs":
      return new GoogleWorkspaceConnector();
    case "notion":
      return new NotionConnector();
    default:
      throw new Error(`Unsupported connector type: ${type}`);
  }
}
