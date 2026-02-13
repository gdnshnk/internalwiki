import type { ConnectorSyncInput, ConnectorSyncResult, WorkspaceConnector } from "./types";
export declare class GoogleWorkspaceConnector implements WorkspaceConnector {
    readonly type: "google_drive";
    sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult>;
}
//# sourceMappingURL=google.d.ts.map