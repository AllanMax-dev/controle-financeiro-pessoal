import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function createAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isAccessTokenShapeValid(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
