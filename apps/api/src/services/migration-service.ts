import { resolve } from "node:path";
import { migrationRuns } from "../db/schema/system";
import { db, sql } from "../db/client";
import { fileExists, listSqlFiles, readTextFile, writeTextFile } from "../lib/fs";
import { logger } from "../lib/logger";
import { writeAuditLog } from "./audit-service";

const coreMigrationDir = resolve(import.meta.dir, "../db/migrations/core");
const generatedMigrationDir = resolve(import.meta.dir, "../../generated/migrations");

export type MigrationFile = {
  key: string;
  title: string;
  sql: string;
  path: string;
};

export async function ensureCoreSchema() {
  const file = resolve(coreMigrationDir, "0000_core.sql");
  const contents = await readTextFile(file);
  await sql.unsafe(contents);

  const alreadyRecorded = await db.query.migrationRuns.findFirst({
    where: (table, operators) => operators.eq(table.migrationKey, "0000_core"),
  });

  if (!alreadyRecorded) {
    await db.insert(migrationRuns).values({
      id: crypto.randomUUID(),
      migrationKey: "0000_core",
      title: "Core schema bootstrap",
      sql: contents,
      status: "applied",
      appliedAt: new Date(),
    });
  }
}

export async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const files = [...(await listSqlFiles(coreMigrationDir)), ...(await listSqlFiles(generatedMigrationDir))];

  return Promise.all(
    files.map(async (file) => {
      const key = file.split("/").pop()!.replace(".sql", "");
      return {
        key,
        title: key.replaceAll("_", " "),
        sql: await readTextFile(file),
        path: file,
      };
    }),
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

  const alreadyApplied = await db.query.migrationRuns.findFirst({
    where: (table, operators) => operators.eq(table.migrationKey, input.key),
  });

  if (alreadyApplied?.status === "applied") {
    return false;
  }

  await sql.begin(async (transaction) => {
    await transaction.unsafe(input.sqlText);
    await transaction.unsafe(
      `insert into migration_runs (id, migration_key, title, sql, status, created_at, applied_at)
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

  const existing = await db.query.migrationRuns.findFirst({
    where: (table, operators) => operators.eq(table.migrationKey, input.key),
  });

  if (existing?.status === "rolled_back") {
    return false;
  }

  await sql.begin(async (transaction) => {
    await transaction.unsafe(input.sqlText);
    await transaction.unsafe(
      `insert into migration_runs (id, migration_key, title, sql, status, created_at, applied_at)
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
  const file = resolve(generatedMigrationDir, `${key}.sql`);
  if (!(await fileExists(file))) {
    await writeTextFile(file, sqlText);
  }
  return file;
}
