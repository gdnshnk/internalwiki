import type { ConnectorSyncInput, ConnectorSyncResult, WorkspaceConnector } from "./types";
export declare class NotionConnector implements WorkspaceConnector {
    readonly type: "notion";
    sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult>;
}
//# sourceMappingURL=notion.d.ts.map