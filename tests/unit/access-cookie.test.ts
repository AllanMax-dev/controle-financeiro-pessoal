import { afterEach, describe, expect, it } from "vitest";

import { accessCookieOptions } from "../../src/modules/access/infrastructure/access-cookie";

const originalApplicationUrl = process.env.APP_URL;

afterEach(() => {
  if (originalApplicationUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalApplicationUrl;
  }
});

describe("access cookie", () => {
  it("uses a secure cookie when the application URL uses HTTPS", () => {
    process.env.APP_URL = "https://financas.example.com";

    expect(accessCookieOptions(new Date()).secure).toBe(true);
  });

  it("allows local HTTP during development and production validation", () => {
    process.env.APP_URL = "http://127.0.0.1:3000";

    expect(accessCookieOptions(new Date()).secure).toBe(false);
  });
});
