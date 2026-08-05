import "dotenv/config";

import { getDatabase } from "../src/lib/db";
import { getServerEnvironment } from "../src/lib/env";

const database = getDatabase();
const environment = getServerEnvironment();

await database.workspace.upsert({
  where: { slug: environment.WORKSPACE_SLUG },
  update: { name: environment.WORKSPACE_NAME },
  create: {
    slug: environment.WORKSPACE_SLUG,
    name: environment.WORKSPACE_NAME,
  },
});

console.log(`Espaço compartilhado preparado: ${environment.WORKSPACE_NAME}`);
await database.$disconnect();
