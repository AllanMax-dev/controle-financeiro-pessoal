import { spawnSync } from "node:child_process";

const failedMigration = "20260812233000_reopen_implicit_paid_installments";
const command = process.platform === "win32" ? "npx.cmd" : "npx";

function runPrisma(args, { allowFailure = false } = {}) {
  const result = spawnSync(command, ["prisma", ...args], { stdio: "inherit" });

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 0;
}

const resolveStatus = runPrisma(["migrate", "resolve", "--rolled-back", failedMigration], { allowFailure: true });

if (resolveStatus !== 0) {
  console.log("No failed migration was resolved; continuing with migrate deploy.");
}

runPrisma(["migrate", "deploy"]);
