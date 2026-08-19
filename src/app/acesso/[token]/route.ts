import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { redeemAccessToken } from "@/modules/access/application/redeem-access-token";
import {
  ACCESS_COOKIE_NAME,
  accessCookieOptions,
} from "@/modules/access/infrastructure/access-cookie";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const session = await redeemAccessToken(token);

  if (!session) {
    return NextResponse.redirect(new URL("/acesso-invalido", request.url));
  }

  const response = NextResponse.redirect(new URL("/painel", request.url));
  const options = accessCookieOptions(session.expiresAt);
  response.headers.append(
    "Set-Cookie",
    [
      `${ACCESS_COOKIE_NAME}=${session.sessionToken}`,
      `Path=${options.path}`,
      `Expires=${options.expires.toUTCString()}`,
      "HttpOnly",
      options.secure ? "Secure" : null,
      `SameSite=${options.sameSite}`,
      `Priority=${options.priority}`,
    ].filter(Boolean).join("; "),
  );

  return response;
}
