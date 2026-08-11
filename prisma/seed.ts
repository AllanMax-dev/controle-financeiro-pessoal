import "dotenv/config";

import { getDatabase } from "../src/lib/db";
import { getServerEnvironment } from "../src/lib/env";

const database = getDatabase();
const environment = getServerEnvironment();

const workspace = await database.workspace.upsert({
  where: { slug: environment.WORKSPACE_SLUG },
  update: { name: environment.WORKSPACE_NAME },
  create: {
    name: environment.WORKSPACE_NAME,
    slug: environment.WORKSPACE_SLUG,
  },
});

await Promise.all(
  ["Allan", "Mayara"].map((displayName) =>
    database.editor.upsert({
      where: {
        workspaceId_displayName: {
          displayName,
          workspaceId: workspace.id,
        },
      },
      update: { active: true },
      create: {
        displayName,
        workspaceId: workspace.id,
      },
    }),
  ),
);

console.log(`Acesso preservado para ${environment.WORKSPACE_NAME}. Nenhum dado financeiro foi criado.`);
await database.$disconnect();
