import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { migrationRuns } from "../db/schema/system";
import { db, sql } from "../db/client";
import { fileExists, readTextFile, writeTextFile } from "../lib/fs";
import { resolveGeneratedMigrationsDir } from "../lib/generated-artifacts";
import { logger } from "../lib/logger";
import { writeAuditLog } from "./audit-service";

const generatedMigrationDir = resolveGeneratedMigrationsDir();
const coreBootstrapMigrationKey = "0000_core";
const coreBootstrapMigrationTitle = "Core schema bootstrap";
const requiredCoreTables = [
  "user",
  "session",
  "account",
  "verification",
  "_system_admins",
  "_plugin_configs",
  "_schema_tables",
  "_schema_fields",
  "_schema_relations",
  "_migration_runs",
  "_audit_logs",
  "_system_settings",
  "_backup_runs",
  "_cron_jobs",
  "_cron_runs",
  "_ai_threads",
  "_ai_messages",
  "_ai_runs",
  "_storage_files",
  "_webhooks",
  "_webhook_deliveries",
] as const;

export type MigrationFile = {
  key: string;
  title: string;
  sql: string;
  path: string;
};

type MigrationArtifact = {
  key: string;
  path: string;
  sqlPath: string;
};

function normalizeMigrationArtifactKey(name: string) {
  return name.replace(/\.sql$/u, "").replace(/^_+/u, "");
}

function migrationTitle(key: string) {
  return key.replaceAll(/[_-]+/g, " ");
}

function moduleSpecifier(fromFile: string, toFile: string) {
  const specifier = relative(dirname(fromFile), toFile).replaceAll("\\", "/");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function splitMigrationStatements(sqlText: string) {
  const chunks = sqlText
    .split(/^\s*-->\s*statement-breakpoint\s*$/gmu)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.length > 0 ? chunks : [sqlText.trim()].filter(Boolean);
}

async function executeMigrationStatements(
  executor: {
    unsafe: (query: string, params?: never[]) => Promise<unknown>;
  },
  sqlText: string,
) {
  for (const statement of splitMigrationStatements(sqlText)) {
    await executor.unsafe(statement);
  }
}

function isIgnorableBootstrapError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return code === "42P07" || code === "42710";
}

async function executeBootstrapStatements(
  executor: {
    unsafe: (query: string, params?: never[]) => Promise<unknown>;
  },
  sqlText: string,
) {
  for (const statement of splitMigrationStatements(sqlText)) {
    try {
      await executor.unsafe(statement);
    } catch (error) {
      if (isIgnorableBootstrapError(error)) {
        continue;
      }
      throw error;
    }
  }
}

async function findMigrationRun(key: string) {
  const rows = await sql<{
    id: string;
    migration_key: string;
    title: string;
    sql: string;
    status: string;
    created_at: Date;
    applied_at: Date | null;
  }[]>`
    select id, migration_key, title, sql, status, created_at, applied_at
    from _migration_runs
    where migration_key = ${key}
    limit 1
  `;

  return rows[0] ?? null;
}

function shellEscape(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function listGeneratedMigrationArtifacts(path: string): Promise<MigrationArtifact[]> {
  if (!(await fileExists(path))) {
    return [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const artifacts: MigrationArtifact[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(path, entry.name);

    if (entry.isFile() && entry.name.endsWith(".sql")) {
      artifacts.push({
        key: normalizeMigrationArtifactKey(entry.name),
        path: fullPath,
        sqlPath: fullPath,
      });
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === "meta") {
        continue;
      }

      const sqlPath = resolve(fullPath, "migration.sql");
      if (await fileExists(sqlPath)) {
        artifacts.push({
          key: normalizeMigrationArtifactKey(entry.name),
          path: fullPath,
          sqlPath,
        });
      }
      continue;
    }
  }

  return artifacts;
}

async function findGeneratedMigrationArtifact(key: string) {
  const artifacts = await listGeneratedMigrationArtifacts(generatedMigrationDir);
  return artifacts.find((artifact) => artifact.key === key) ?? null;
}

async function createTempDrizzleWorkspace() {
  const tempBaseDir = resolve(import.meta.dir, "../../../.tmp");
  await mkdir(tempBaseDir, { recursive: true });
  const tempRoot = await mkdtemp(join(tempBaseDir, "authend-drizzle-"));
  const tempOutDir = resolve(tempRoot, "migrations");
  return {
    tempRoot,
    tempOutDir,
  };
}

async function runDrizzleGenerate(input: {
  name: string;
  outDir: string;
  schemaPaths: string[];
  custom?: boolean;
}) {
  const { tempRoot } = await createTempDrizzleWorkspace();

  try {
    const drizzleEnv = { ...process.env } as Record<string, string | undefined>;
    for (const key of [
      "NODE_ENV",
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "APP_URL",
      "ADMIN_URL",
      "ADMIN_DEV_URL",
      "CORS_ORIGIN",
      "BETTER_AUTH_SECRET",
      "SUPERADMIN_EMAIL",
      "SUPERADMIN_PASSWORD",
      "SUPERADMIN_NAME",
      "AUTHEND_GENERATED_SCHEMA_FILE",
      "AUTHEND_GENERATED_MIGRATIONS_DIR",
      "AUTHEND_DRIZZLE_SCHEMA_PATHS",
      "AUTHEND_DRIZZLE_MIGRATIONS_DIR",
    ]) {
      delete drizzleEnv[key];
    }

    const configPath = resolve(tempRoot, "drizzle.config.ts");
    await writeTextFile(
      configPath,
      `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ${JSON.stringify(input.schemaPaths)},
  out: ${JSON.stringify(input.outDir)},
  migrations: {
    prefix: "none",
  },
});
`,
    );

    const command = [
      `${shellEscape(process.execPath)} x drizzle-kit generate`,
      `--config=${shellEscape(configPath)}`,
      `--name=${shellEscape(input.name)}`,
      input.custom ? "--custom" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const subprocess = spawnSync("/bin/zsh", ["-lc", command], {
      cwd: resolve(import.meta.dir, "../../.."),
      env: {
        PATH: drizzleEnv.PATH,
        HOME: drizzleEnv.HOME,
        TMPDIR: drizzleEnv.TMPDIR,
        USER: drizzleEnv.USER,
        SHELL: drizzleEnv.SHELL,
        BUN_INSTALL: drizzleEnv.BUN_INSTALL,
      },
      encoding: "utf8",
    });

    const exitCode = subprocess.status ?? 1;
    const stdout = subprocess.stdout ?? "";
    const stderr = subprocess.stderr ?? "";

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `drizzle-kit generate exited with code ${exitCode}`);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function createGeneratedMigration(input: {
  key: string;
  schemaPaths?: string[];
  schemaPath?: string;
  schemaText?: string;
  persist?: boolean;
  customSql?: string;
  existingArtifactsDir?: string | null;
  persistDir?: string;
}) {
  const { tempRoot, tempOutDir } = await createTempDrizzleWorkspace();

  try {
    const existingArtifactsDir = input.existingArtifactsDir ?? generatedMigrationDir;
    if (existingArtifactsDir && (await fileExists(existingArtifactsDir))) {
      await cp(existingArtifactsDir, tempOutDir, { recursive: true, force: true });
    }

    const before = await listGeneratedMigrationArtifacts(tempOutDir);
    const schemaPaths = input.schemaPaths
      ? input.schemaPaths.map((path) => resolve(path))
      : input.schemaPath
        ? [resolve(input.schemaPath)]
        : [resolve(tempRoot, "generated-schema.ts")];

    if (input.schemaText) {
      const schemaPath = resolve(tempRoot, "generated/schema/generated.ts");
      const liveAuthPath = resolve(import.meta.dir, "../db/schema/auth.ts");
      const liveSystemPath = resolve(import.meta.dir, "../db/schema/system.ts");
      const schemaText = input.schemaText
        .replaceAll("../../src/core/db/schema/auth.ts", moduleSpecifier(schemaPath, liveAuthPath))
        .replaceAll("../../src/core/db/schema/system.ts", moduleSpecifier(schemaPath, liveSystemPath));

      await writeTextFile(schemaPath, schemaText);
      schemaPaths.splice(0, schemaPaths.length, liveAuthPath, liveSystemPath, schemaPath);
    } else if (!input.schemaPath) {
      await writeTextFile(schemaPaths[0], "export {};\n");
    }

    await runDrizzleGenerate({
      name: input.key,
      outDir: tempOutDir,
      schemaPaths,
      custom: typeof input.customSql === "string",
    });

    const after = await listGeneratedMigrationArtifacts(tempOutDir);
    const created = after.filter((artifact) => !before.some((existing) => existing.key === artifact.key));
    const artifact = created.find((entry) => entry.key === input.key) ?? created[0] ?? after.find((entry) => entry.key === input.key) ?? null;

    if (!artifact) {
      throw new Error(`Drizzle did not create a migration artifact for ${input.key}`);
    }

    if (typeof input.customSql === "string") {
      await writeTextFile(artifact.sqlPath, input.customSql);
    }

    if (input.persist) {
      await cp(tempOutDir, input.persistDir ?? generatedMigrationDir, { recursive: true, force: true });
    }

    const sqlText = await readTextFile(artifact.sqlPath);
    return {
      key: artifact.key,
      path: artifact.path,
      sqlPath: artifact.sqlPath,
      sql: sqlText,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function ensureCoreSchema() {
  const existingCoreTables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = current_schema()
      and table_name = any(${requiredCoreTables}::text[])
  `;
  const existingCoreTableNames = new Set(existingCoreTables.map((row) => row.table_name));
  const hasRequiredCoreTables = requiredCoreTables.every((tableName) => existingCoreTableNames.has(tableName));

  if (hasRequiredCoreTables) {
    const alreadyRecorded = await findMigrationRun(coreBootstrapMigrationKey);

    if (alreadyRecorded) {
      return;
    }

    await db.insert(migrationRuns).values({
      id: crypto.randomUUID(),
      migrationKey: coreBootstrapMigrationKey,
      title: coreBootstrapMigrationTitle,
      sql: "-- Core schema bootstrap inferred from existing database state.\n",
      status: "applied",
      appliedAt: new Date(),
    });

    return;
  }

  const coreBootstrapArtifact = await findGeneratedMigrationArtifact(coreBootstrapMigrationKey);

  if (!coreBootstrapArtifact) {
    throw new Error(
      `Missing core bootstrap migration for ${coreBootstrapMigrationKey} in ${generatedMigrationDir}. Restore the Drizzle baseline before starting the API.`,
    );
  }

  const bootstrapSql = await readTextFile(coreBootstrapArtifact.sqlPath);
  await executeBootstrapStatements(sql, bootstrapSql);

  await sql.unsafe(
    `insert into _migration_runs (id, migration_key, title, sql, status, created_at, applied_at)
     values ($1, $2, $3, $4, 'applied', now(), now())
     on conflict (migration_key) do update
     set title = excluded.title,
         sql = excluded.sql,
         status = excluded.status,
         applied_at = excluded.applied_at`,
    [crypto.randomUUID(), coreBootstrapMigrationKey, coreBootstrapMigrationTitle, bootstrapSql] as never[],
  );
}

export async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const generatedFiles = await listGeneratedMigrationArtifacts(generatedMigrationDir);

  return Promise.all(
    generatedFiles.map(async (artifact) => ({
      key: artifact.key,
      title: migrationTitle(artifact.key),
      sql: await readTextFile(artifact.sqlPath),
      path: artifact.sqlPath,
    })),
  );
}

export async function listMigrationHistory() {
  const rows = await db.select().from(migrationRuns);
  return rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

export async function previewPendingMigrations() {
  await ensureCoreSchema();
  const history = await listMigrationHistory();
  const appliedKeys = new Set(history.filter((item) => item.status === "applied").map((item) => item.migrationKey));
  const files = await loadMigrationFiles();

  return files
    .filter((file) => !appliedKeys.has(file.key))
    .map((file) => ({
      id: file.key,
      key: file.key,
      title: file.title,
      status: "pending" as const,
      sql: file.sql,
      appliedAt: null,
    }));
}

export async function applySqlMigration(input: {
  key: string;
  title: string;
  sqlText: string;
  actorUserId?: string | null;
}) {
  await ensureCoreSchema();

  const alreadyApplied = await findMigrationRun(input.key);

  if (alreadyApplied?.status === "applied") {
    return false;
  }

  await sql.begin(async (transaction) => {
    await executeMigrationStatements(transaction, input.sqlText);
    await transaction.unsafe(
      `insert into _migration_runs (id, migration_key, title, sql, status, created_at, applied_at)
       values ($1, $2, $3, $4, 'applied', now(), now())
       on conflict (migration_key) do update
       set title = excluded.title,
           sql = excluded.sql,
           status = excluded.status,
           applied_at = excluded.applied_at`,
      [crypto.randomUUID(), input.key, input.title, input.sqlText] as never[],
    );
  });

  await writeAuditLog({
    action: "migration.applied",
    actorUserId: input.actorUserId ?? null,
    target: input.key,
    payload: { title: input.title },
  });

  logger.info("migration.applied", { key: input.key });
  return true;
}

export async function rollbackSqlMigration(input: {
  key: string;
  title: string;
  sqlText: string;
  actorUserId?: string | null;
}) {
  await ensureCoreSchema();

  const existing = await findMigrationRun(input.key);

  if (existing?.status === "rolled_back") {
    return false;
  }

  await sql.begin(async (transaction) => {
    await executeMigrationStatements(transaction, input.sqlText);
    await transaction.unsafe(
      `insert into _migration_runs (id, migration_key, title, sql, status, created_at, applied_at)
       values ($1, $2, $3, $4, 'rolled_back', now(), now())
       on conflict (migration_key) do update
       set title = excluded.title,
           status = excluded.status,
           applied_at = excluded.applied_at`,
      [crypto.randomUUID(), input.key, input.title, input.sqlText] as never[],
    );
  });

  await writeAuditLog({
    action: "migration.rolled_back",
    actorUserId: input.actorUserId ?? null,
    target: input.key,
    payload: { title: input.title },
  });

  logger.info("migration.rolled_back", { key: input.key });
  return true;
}

export async function applyPendingMigrations(actorUserId?: string | null) {
  const pending = await previewPendingMigrations();
  const applied: string[] = [];

  for (const migration of pending) {
    const didApply = await applySqlMigration({
      key: migration.key,
      title: migration.title,
      sqlText: migration.sql,
      actorUserId,
    });

    if (didApply) {
      applied.push(migration.key);
    }
  }

  return applied;
}

export async function writeGeneratedMigration(key: string, sqlText: string) {
  const preferredPath = resolve(generatedMigrationDir, `${key}.sql`);
  if (await fileExists(preferredPath)) {
    return preferredPath;
  }

  const artifact = await createGeneratedMigration({
    key,
    persist: true,
    customSql: sqlText,
  });

  if (artifact.sqlPath !== preferredPath) {
    await writeTextFile(preferredPath, sqlText);
    await rm(artifact.sqlPath, { force: true });
  }

  return preferredPath;
}

export async function previewGeneratedSchemaMigration(input: {
  key: string;
  schemaPath?: string;
  schemaText?: string;
}) {
  return createGeneratedMigration({
    key: input.key,
    schemaPath: input.schemaPath,
    schemaText: input.schemaText,
    persist: false,
  });
}

export async function persistGeneratedSchemaMigration(input: {
  key: string;
  schemaPath?: string;
  schemaText?: string;
}) {
  return createGeneratedMigration({
    key: input.key,
    schemaPath: input.schemaPath,
    schemaText: input.schemaText,
    persist: true,
  });
}
