import { getDatabase } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import {
  createAccessToken,
  hashAccessToken,
  isAccessTokenShapeValid,
} from "@/modules/access/domain/access-token";

export async function redeemAccessToken(token: string) {
  if (!isAccessTokenShapeValid(token)) {
    return null;
  }

  const database = getDatabase();
  const environment = getServerEnvironment();
  const grant = await database.accessGrant.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      editor: {
        include: { workspace: true },
      },
    },
  });

  if (!grant?.active || !grant.editor.active) {
    return null;
  }

  const sessionToken = createAccessToken();
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + environment.SESSION_TTL_DAYS);

  await database.$transaction([
    database.accessSession.create({
      data: {
        grantId: grant.id,
        tokenHash: hashAccessToken(sessionToken),
        expiresAt,
      },
    }),
    database.accessGrant.update({
      where: { id: grant.id },
      data: { lastUsedAt: new Date() },
    }),
  ]);

  return {
    sessionToken,
    expiresAt,
  };
}
