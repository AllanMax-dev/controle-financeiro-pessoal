import { spawnSync } from "node:child_process";

import pg from "pg";

const FAILED_MIGRATION = "20260818170000_enforce_transactional_integrity";

function postgresUrl() {
  const candidates = [
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const url = new URL(candidate);
      if (url.protocol === "postgres:" || url.protocol === "postgresql:") {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function main() {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") {
    return;
  }

  const connectionString = postgresUrl();
  if (!connectionString) {
    console.log("No PostgreSQL URL available for migration recovery.");
    return;
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT migration_name
       FROM _prisma_migrations
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL
       LIMIT 1`,
      [FAILED_MIGRATION],
    );

    if (result.rowCount !== 1) {
      return;
    }

    console.log(`Resolving failed migration state: ${FAILED_MIGRATION}`);
    const prisma = process.platform === "win32" ? "prisma.cmd" : "prisma";
    const resolved = spawnSync(
      prisma,
      ["migrate", "resolve", "--rolled-back", FAILED_MIGRATION],
      { stdio: "inherit" },
    );

    if (resolved.status !== 0) {
      process.exit(resolved.status ?? 1);
    }
  } catch (error) {
    if (error?.code !== "42P01") {
      throw error;
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
