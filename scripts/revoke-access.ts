import "dotenv/config";

import { getDatabase } from "../src/lib/db";
import { getServerEnvironment } from "../src/lib/env";

function readArgument(name: string): string | undefined {
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

const displayName = readArgument("--name")?.trim();

if (!displayName) {
  console.error('Informe o nome: npm run access:revoke -- --name "Pessoa 1"');
  process.exitCode = 1;
} else {
  const database = getDatabase();
  const environment = getServerEnvironment();

  try {
    const editor = await database.editor.findFirst({
      where: {
        displayName,
        workspace: { slug: environment.WORKSPACE_SLUG },
      },
    });

    if (!editor) {
      console.error(`Pessoa não encontrada: ${displayName}`);
      process.exitCode = 1;
    } else {
      await database.$transaction([
        database.accessSession.deleteMany({
          where: { grant: { editorId: editor.id } },
        }),
        database.accessGrant.updateMany({
          where: { editorId: editor.id },
          data: { active: false },
        }),
        database.editor.update({
          where: { id: editor.id },
          data: { active: false },
        }),
      ]);

      console.log(`Acesso revogado para ${displayName}.`);
    }
  } finally {
    await database.$disconnect();
  }
}
