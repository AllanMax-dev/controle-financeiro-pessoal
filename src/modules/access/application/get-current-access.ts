import { cookies } from "next/headers";
import { cache } from "react";

import { getDatabase } from "@/lib/db";
import { hashAccessToken, isAccessTokenShapeValid } from "@/modules/access/domain/access-token";
import { ACCESS_COOKIE_NAME } from "@/modules/access/infrastructure/access-cookie";

export const getCurrentAccess = cache(async function getCurrentAccess() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;

  if (!sessionToken || !isAccessTokenShapeValid(sessionToken)) {
    return null;
  }

  const session = await getDatabase().accessSession.findUnique({
    where: { tokenHash: hashAccessToken(sessionToken) },
    include: {
      grant: {
        include: {
          editor: {
            include: { workspace: true },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.grant.active ||
    !session.grant.editor.active
  ) {
    return null;
  }

  return {
    editorId: session.grant.editor.id,
    editorName: session.grant.editor.displayName,
    workspaceId: session.grant.editor.workspace.id,
    workspaceName: session.grant.editor.workspace.name,
  };
});
