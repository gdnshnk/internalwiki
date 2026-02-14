import { describe, expect, test } from "vitest";
import { GoogleWorkspaceConnector } from "../src/google";
import { SlackConnector } from "../src/slack";
import { MicrosoftTeamsConnector } from "../src/microsoft";

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

  test("slack connector returns sample items when access token is missing", async () => {
    const connector = new SlackConnector();
    const result = await connector.sync({
      connectorAccountId: "c2",
      organizationId: "org1",
      credentials: {
        accessToken: ""
      }
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.sourceType).toBe("slack");
  });

  test("microsoft teams connector returns sample items when access token is missing", async () => {
    const connector = new MicrosoftTeamsConnector();
    const result = await connector.sync({
      connectorAccountId: "c3",
      organizationId: "org1",
      credentials: {
        accessToken: ""
      }
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.sourceType).toBe("microsoft_teams");
  });
});
