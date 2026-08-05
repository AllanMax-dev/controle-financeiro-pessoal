import "dotenv/config";

import { getDatabase } from "../src/lib/db";
import { createAccessLink } from "../src/modules/access/application/create-access-link";

function readArgument(name: string): string | undefined {
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

const displayName = readArgument("--name")?.trim();

if (!displayName) {
  console.error('Informe o nome: npm run access:create -- --name "Pessoa 1"');
  process.exitCode = 1;
} else {
  try {
    const result = await createAccessLink(displayName);
    console.log(`Acesso criado para ${result.editorName} em ${result.workspaceName}:`);
    console.log(result.accessUrl);
    console.log("Guarde este endereço em local seguro. Um novo link revoga o anterior.");
  } finally {
    await getDatabase().$disconnect();
  }
}
