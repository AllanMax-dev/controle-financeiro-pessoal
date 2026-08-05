export const ACCESS_COOKIE_NAME = "shared_finance_session";

export function accessCookieOptions(expiresAt: Date) {
  const configuredApplicationUrl = process.env.APP_URL;
  const secure = configuredApplicationUrl
    ? new URL(configuredApplicationUrl).protocol === "https:"
    : process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    priority: "high" as const,
  };
}
