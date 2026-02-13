import { describe, expect, test } from "vitest";
import { GoogleWorkspaceConnector } from "../src/google";
import { NotionConnector } from "../src/notion";

describe("connectors sample mode", () => {
  test("google connector returns sample items when access token is missing", async () => {
    const connector = new GoogleWorkspaceConnector();
    const result = await connector.sync({
      connectorAccountId: "c1",
      organizationId: "org1",
      credentials: {
        accessToken: ""
      }
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.sourceType === "google_docs" || item.sourceType === "google_drive")).toBe(true);
  });

  test("notion connector returns sample items when access token is missing", async () => {
    const connector = new NotionConnector();
    const result = await connector.sync({
      connectorAccountId: "c2",
      organizationId: "org1",
      credentials: {
        accessToken: ""
      }
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.sourceType).toBe("notion");
  });
});
