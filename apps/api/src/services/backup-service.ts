import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { desc, eq } from "drizzle-orm";
import type { BackupRun } from "@authend/shared";
import { env } from "../config/env";
import { db } from "../db/client";
import { backupRuns } from "../db/schema/system";
import { HttpError } from "../lib/http";
import { logger } from "../lib/logger";
import { readSettingsSection } from "./settings-store";

function serialiseBackupRun(row: typeof backupRuns.$inferSelect): BackupRun {
  return {
    id: row.id,
    status: row.status as BackupRun["status"],
    trigger: row.trigger as BackupRun["trigger"],
    destination: row.destination,
    filePath: row.filePath,
    sizeBytes: row.sizeBytes ? Number(row.sizeBytes) : null,
    details: (row.details as Record<string, unknown>) ?? {},
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function listBackupRuns(limit = 20) {
  const rows = await db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(limit);
  return rows.map(serialiseBackupRun);
}

export async function runBackupNow(actorUserId?: string | null, trigger: BackupRun["trigger"] = "manual") {
  const { config } = await readSettingsSection("backups");
  if (!config.enabled) {
    throw new HttpError(400, "Backups are disabled in settings.");
  }

  const destinationDir = resolve(process.cwd(), config.directoryPath);
  await mkdir(destinationDir, { recursive: true });

  const startedAt = new Date();
  const extension = config.format === "custom" ? "dump" : "sql";
  const fileName = `authend-backup-${startedAt.toISOString().replaceAll(":", "-")}.${extension}`;
  const filePath = resolve(destinationDir, fileName);
  const runId = crypto.randomUUID();

  await db.insert(backupRuns).values({
    id: runId,
    status: "running",
    trigger,
    destination: destinationDir,
    filePath,
    details: {
      format: config.format,
      verifyOnCreate: config.verifyOnCreate,
    },
    startedAt,
  });

  try {
    const command = [
      config.pgDumpPath,
      `--dbname=${env.DATABASE_URL}`,
      `--file=${filePath}`,
      ...(config.format === "custom" ? ["--format=custom"] : []),
    ];

    const subprocess = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    const exitCode = await subprocess.exited;
    const stderr = subprocess.stderr ? await new Response(subprocess.stderr).text() : "";
    const stdout = subprocess.stdout ? await new Response(subprocess.stdout).text() : "";

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `pg_dump exited with code ${exitCode}`);
    }

    const sizeBytes = Number(Bun.file(filePath).size ?? 0);
    if (config.verifyOnCreate && sizeBytes <= 0) {
      throw new Error("Backup file was created but is empty.");
    }

    if (config.retentionDays > 0) {
      const files = await readdir(destinationDir);
      const olderThanMs = config.retentionDays * 24 * 60 * 60 * 1000;
      await Promise.all(
        files
          .filter((entry) => entry.startsWith("authend-backup-"))
          .map(async (entry) => {
            const fullPath = resolve(destinationDir, entry);
            const metadata = await stat(fullPath);
            if (Date.now() - metadata.mtimeMs >= olderThanMs) {
              await unlink(fullPath);
            }
          }),
      );
    }

    const completedAt = new Date();
    await db
      .update(backupRuns)
      .set({
        status: "succeeded",
        sizeBytes: String(sizeBytes),
        details: {
          format: config.format,
          verifyOnCreate: config.verifyOnCreate,
          stdout: stdout.trim() || null,
        },
        completedAt,
      })
      .where(eq(backupRuns.id, runId));

    logger.info("backup.completed", { runId, filePath, sizeBytes, trigger, actorUserId: actorUserId ?? null });
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Backup failed";
    await db
      .update(backupRuns)
      .set({
        status: "failed",
        error: message,
        completedAt,
      })
      .where(eq(backupRuns.id, runId));

    logger.error("backup.failed", { runId, trigger, error: message, actorUserId: actorUserId ?? null });
  }

  const saved = await db.query.backupRuns.findFirst({
    where: (table, operators) => operators.eq(table.id, runId),
  });

  if (!saved) {
    throw new HttpError(500, "Backup run could not be loaded after execution.");
  }

  return serialiseBackupRun(saved);
}
