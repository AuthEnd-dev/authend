import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";

test("drizzle baseline only diffs new generated tables", async () => {
  const repoRoot = resolve(import.meta.dir, "../../../..");
  const apiRoot = resolve(repoRoot, "apps/api");
  const tempRoot = await mkdtemp(resolve(apiRoot, ".tmp-authend-drizzle-baseline-"));
  const tempOut = resolve(tempRoot, "migrations");
  const tempSchema = resolve(tempRoot, "generated.ts");

  try {
    await mkdir(tempOut, { recursive: true });
    await cp(resolve(apiRoot, "generated/migrations"), tempOut, { recursive: true, force: true });
    await Bun.write(
      tempSchema,
      `import { pgTable, text } from "drizzle-orm/pg-core";

export const tmp_drizzle_guard = pgTable("tmp_drizzle_guard", {
  id: text("id").primaryKey(),
});
`,
    );

    const command = spawnSync(
      process.execPath,
      [
        "x",
        "drizzle-kit",
        "generate",
        `--config=${resolve(apiRoot, "drizzle.config.ts")}`,
        "--name=tmp_guard",
      ],
      {
        cwd: apiRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          AUTHEND_DRIZZLE_SCHEMA_PATHS: [
            resolve(apiRoot, "src/core/db/schema/auth.ts"),
            resolve(apiRoot, "src/core/db/schema/system.ts"),
            tempSchema,
          ].join(","),
          AUTHEND_DRIZZLE_MIGRATIONS_DIR: relative(apiRoot, tempOut),
        },
      },
    );

    const output = `${command.stdout}\n${command.stderr}`;
    expect(command.status, output).toBe(0);
    expect(output).not.toContain("Cannot find module 'drizzle-orm/pg-core'");

    const migrationSql = await Bun.file(resolve(tempOut, "0001_tmp_guard.sql")).text();
    expect(migrationSql).toContain('CREATE TABLE "tmp_drizzle_guard"');
    expect(migrationSql).not.toContain('CREATE TABLE "account"');
    expect(migrationSql).not.toContain('CREATE TABLE "_plugin_configs"');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
