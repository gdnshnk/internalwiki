export class ConnectorSyncError extends Error {
    classification;
    statusCode;
    constructor(message, classification, statusCode) {
        super(message);
        this.name = "ConnectorSyncError";
        this.classification = classification;
        this.statusCode = statusCode;
    }
}
//# sourceMappingURL=types.js.map