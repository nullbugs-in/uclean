import { describe, expect, it, vi } from "vitest";

import { requireCronAuth } from "./cron-auth";

/**
 * The cron surface is the one place in the source document that required a
 * security decision nobody had written down. These tests pin the behaviour so
 * a later refactor cannot quietly drop the check.
 */

function makeRequest(headers: Record<string, string>) {
  return {
    headers: {
      get: (name: string) =>
        headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Parameters<typeof requireCronAuth>[0];
}

describe("requireCronAuth", () => {
  it("fails closed when CRON_SECRET is not configured", () => {
    vi.stubEnv("CRON_SECRET", undefined as unknown as string);
    const response = requireCronAuth(
      makeRequest({ authorization: "Bearer anything" }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
  });

  it("rejects a request with no Authorization header", () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    const response = requireCronAuth(makeRequest({}));

    expect(response?.status).toBe(401);
  });

  it("rejects a wrong secret", () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    const response = requireCronAuth(
      makeRequest({ authorization: "Bearer wrong-secret" }),
    );

    expect(response?.status).toBe(401);
  });

  it("rejects a bare secret without the Bearer prefix", () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    const response = requireCronAuth(
      makeRequest({ authorization: "a-long-random-secret" }),
    );

    expect(response?.status).toBe(401);
  });

  it("accepts the correct bearer token", () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    const response = requireCronAuth(
      makeRequest({ authorization: "Bearer a-long-random-secret" }),
    );

    expect(response).toBeNull();
  });

  vi.unstubAllEnvs();
});
