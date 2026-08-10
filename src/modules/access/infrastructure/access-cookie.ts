export const ACCESS_COOKIE_NAME = "shared_finance_session";

export function accessCookieOptions(expiresAt: Date) {
  const configuredApplicationUrl = process.env.APP_URL;
  const secure = process.env.NODE_ENV === "production"
    ? true
    : Boolean(configuredApplicationUrl && new URL(configuredApplicationUrl).protocol === "https:");

  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    priority: "high" as const,
  };
}
