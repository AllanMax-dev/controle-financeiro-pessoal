import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/lib/env";

const globalForDatabase = globalThis as unknown as {
  database?: PrismaClient;
};

export function getDatabase(): PrismaClient {
  if (!globalForDatabase.database) {
    const environment = getServerEnvironment();
    const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });

    globalForDatabase.database = new PrismaClient({ adapter });
  }

  return globalForDatabase.database;
}
