import { describe, expect, it } from "vitest";

import {
  createAccessToken,
  hashAccessToken,
  isAccessTokenShapeValid,
} from "../../src/modules/access/domain/access-token";

describe("access token", () => {
  it("creates unpredictable URL-safe tokens", () => {
    const first = createAccessToken();
    const second = createAccessToken();

    expect(first).not.toBe(second);
    expect(isAccessTokenShapeValid(first)).toBe(true);
    expect(isAccessTokenShapeValid(second)).toBe(true);
  });

  it("hashes the token deterministically without returning the original value", () => {
    const token = createAccessToken();
    const hash = hashAccessToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashAccessToken(token));
    expect(hash).not.toContain(token);
  });

  it("rejects malformed values", () => {
    expect(isAccessTokenShapeValid("short-token")).toBe(false);
    expect(isAccessTokenShapeValid("a".repeat(42) + "/")).toBe(false);
  });
});
