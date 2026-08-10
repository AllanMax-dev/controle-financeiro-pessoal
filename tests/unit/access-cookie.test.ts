import { afterEach, describe, expect, it, vi } from "vitest";

import { accessCookieOptions } from "../../src/modules/access/infrastructure/access-cookie";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("access cookie", () => {
  it("uses a secure cookie when the application URL uses HTTPS", () => {
    vi.stubEnv("APP_URL", "https://financas.example.com");

    expect(accessCookieOptions(new Date()).secure).toBe(true);
  });

  it("allows local HTTP during development", () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
    vi.stubEnv("NODE_ENV", "development");

    expect(accessCookieOptions(new Date()).secure).toBe(false);
  });

  it("forces a secure cookie in production", () => {
    vi.stubEnv("APP_URL", "http://financas.example.com");
    vi.stubEnv("NODE_ENV", "production");

    expect(accessCookieOptions(new Date()).secure).toBe(true);
  });
});
