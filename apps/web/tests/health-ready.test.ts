import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn()
}));

vi.mock("@internalwiki/db", () => ({
  query: queryMock
}));

import { GET as healthGet } from "@/app/api/health/route";
import { GET as readyGet } from "@/app/api/ready/route";

const envSnapshot = { ...process.env };

function setCriticalReadyEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://localhost:5432/internalwiki",
    INTERNALWIKI_ENCRYPTION_KEY: "x".repeat(32),
    INTERNALWIKI_SESSION_SIGNING_KEY: "y".repeat(32)
  });
}

describe("health and readiness routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCriticalReadyEnv();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envSnapshot);
  });

  it("returns health payload with request id header", async () => {
    const response = await healthGet(new Request("http://localhost/api/health"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("@internalwiki/web");
  });

  it("returns ready when env and db checks pass", async () => {
    queryMock.mockResolvedValueOnce([{ ok: 1 }]);
    const response = await readyGet(new Request("http://localhost/api/ready"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ready).toBe(true);
    expect(payload.checks.env.ok).toBe(true);
    expect(payload.checks.database.ok).toBe(true);
  });

  it("returns not ready when critical env is missing", async () => {
    delete process.env.DATABASE_URL;
    queryMock.mockResolvedValueOnce([{ ok: 1 }]);

    const response = await readyGet(new Request("http://localhost/api/ready"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ready).toBe(false);
    expect(payload.checks.env.ok).toBe(false);
    expect(payload.checks.env.missing).toContain("DATABASE_URL");
  });

  it("returns not ready when db health check fails", async () => {
    queryMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const response = await readyGet(new Request("http://localhost/api/ready"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ready).toBe(false);
    expect(payload.checks.database.ok).toBe(false);
    expect(payload.checks.database.error).toContain("ECONNREFUSED");
  });
});
