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
  response.cookies.set(
    ACCESS_COOKIE_NAME,
    session.sessionToken,
    accessCookieOptions(session.expiresAt),
  );

  return response;
}
