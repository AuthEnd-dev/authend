import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { writeTextFile } from "../lib/fs";
import { resolveGeneratedSchemaFile } from "../lib/generated-artifacts";
import { getSchemaDraft, schemaServiceTestUtils } from "../services/schema-service";

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log("Usage: bun src/core/scripts/generate-migration.ts <name>");
  console.log("Regenerates generated/schema/generated.ts and then runs drizzle-kit generate with the provided migration name.");
  process.exit(0);
}

const migrationName = args[0]?.trim();

if (!migrationName) {
  console.error("Missing migration name. Example: bun run generate:migration add_projects_table");
  process.exit(1);
}

const apiRoot = resolve(import.meta.dir, "../../..");
try {
  const generatedSchemaFile = resolveGeneratedSchemaFile();
  const draft = await getSchemaDraft();
  const schemaText = schemaServiceTestUtils.renderSchemaModule(draft);

  await writeTextFile(generatedSchemaFile, schemaText);

  const command = `${JSON.stringify(process.execPath)} x drizzle-kit generate --config=${JSON.stringify(resolve(apiRoot, "drizzle.config.ts"))} --name=${JSON.stringify(migrationName)}`;
  const subprocess = spawnSync("/bin/zsh", ["-lc", command], {
    cwd: apiRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (subprocess.status !== 0) {
    process.exit(subprocess.status ?? 1);
  }

  console.log(
    JSON.stringify({
      action: "migration.generated",
      name: migrationName,
      schemaPath: generatedSchemaFile,
    }),
  );
} finally {
  try {
    const { sql } = await import("../db/client");
    await sql.end({ timeout: 0 });
  } catch {
    // Ignore shutdown failures when generation exits early.
  }
}
