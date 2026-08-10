import "dotenv/config";

import { getDatabase } from "../src/lib/db";
import { getServerEnvironment } from "../src/lib/env";

const database = getDatabase();
const environment = getServerEnvironment();

const workspace = await database.workspace.upsert({
  where: { slug: environment.WORKSPACE_SLUG },
  update: { name: environment.WORKSPACE_NAME },
  create: {
    slug: environment.WORKSPACE_SLUG,
    name: environment.WORKSPACE_NAME,
  },
});

const editors = await Promise.all(
  ["Allan", "Mayara"].map((displayName) =>
    database.editor.upsert({
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
    }),
  ),
);

await database.financialContext.upsert({
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

for (const editor of editors) {
  await database.financialContext.upsert({
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
}

console.log(`Espaço compartilhado preparado: ${environment.WORKSPACE_NAME}`);
await database.$disconnect();
