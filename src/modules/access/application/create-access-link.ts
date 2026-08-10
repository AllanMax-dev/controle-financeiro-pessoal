import { getDatabase } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { createAccessToken, hashAccessToken } from "@/modules/access/domain/access-token";

export async function createAccessLink(displayName: string) {
  const environment = getServerEnvironment();
  const database = getDatabase();
  const token = createAccessToken();
  const tokenHash = hashAccessToken(token);

  const result = await database.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.upsert({
      where: { slug: environment.WORKSPACE_SLUG },
      update: { name: environment.WORKSPACE_NAME },
      create: {
        slug: environment.WORKSPACE_SLUG,
        name: environment.WORKSPACE_NAME,
      },
    });

    const editor = await transaction.editor.upsert({
      where: {
        workspaceId_displayName: {
          workspaceId: workspace.id,
          displayName,
        },
      },
      update: { active: true },
      create: {
        workspaceId: workspace.id,
        displayName,
      },
    });

    await transaction.financialContext.upsert({
      where: {
        workspaceId_name: {
          workspaceId: workspace.id,
          name: "Casal",
        },
      },
      update: { active: true },
      create: {
        workspaceId: workspace.id,
        name: "Casal",
        type: "COUPLE",
      },
    });

    await transaction.financialContext.upsert({
      where: {
        workspaceId_name: {
          workspaceId: workspace.id,
          name: editor.displayName,
        },
      },
      update: { active: true, ownerEditorId: editor.id },
      create: {
        workspaceId: workspace.id,
        ownerEditorId: editor.id,
        name: editor.displayName,
        type: "PERSONAL",
      },
    });

    await transaction.accessGrant.updateMany({
      where: { editorId: editor.id, active: true },
      data: { active: false },
    });

    await transaction.accessSession.deleteMany({
      where: { grant: { editorId: editor.id } },
    });

    await transaction.accessGrant.create({
      data: {
        editorId: editor.id,
        tokenHash,
      },
    });

    return { editor, workspace };
  });

  const accessUrl = new URL(`/acesso/${token}`, environment.APP_URL).toString();

  return {
    accessUrl,
    editorName: result.editor.displayName,
    workspaceName: result.workspace.name,
  };
}
