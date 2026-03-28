import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { desc, eq } from "drizzle-orm";
import type { BackupRun } from "@authend/shared";
import { env } from "../config/env";
import { db } from "../db/client";
import { backupRuns } from "../db/schema/system";
import { HttpError } from "../lib/http";
import { logger } from "../lib/logger";
import { readSettingsSection } from "./settings-store";
import { writeAuditLog } from "./audit-service";
import { readStoredObjectBuffer, removeStoredFile, writeManagedStorageObject } from "./storage-service";

type CompatibleBackupSettings = {
  enabled: boolean;
  directoryPath: string;
  retentionDays: number;
  pgDumpPath: string;
  pgRestorePath: string;
  format: "plain" | "custom";
  verifyOnCreate: boolean;
  artifactStorage?: "filesystem" | "storage";
  storagePrefix?: string;
};

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

function buildBackupStorageKey(prefix: string, fileName: string) {
  const normalizedPrefix = prefix
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
  return normalizedPrefix.length > 0 ? `${normalizedPrefix}/${fileName}` : fileName;
}

export async function listBackupRuns(limit = 20) {
  const rows = await db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(limit);
  return rows.map(serialiseBackupRun);
}

async function completeBackupRun(
  runId: string,
  input:
    | {
        status: "succeeded";
        details: Record<string, unknown>;
        sizeBytes?: number | null;
      }
    | {
        status: "failed";
        error: string;
      },
) {
  const completedAt = new Date();
  if (input.status === "succeeded") {
    await db
      .update(backupRuns)
      .set({
        status: "succeeded",
        sizeBytes: input.sizeBytes != null ? String(input.sizeBytes) : null,
        details: input.details,
        completedAt,
        error: null,
      })
      .where(eq(backupRuns.id, runId));
    return;
  }

  await db
    .update(backupRuns)
    .set({
      status: "failed",
      error: input.error,
      completedAt,
    })
    .where(eq(backupRuns.id, runId));
}

async function loadBackupRunOrThrow(runId: string) {
  const saved = await db.query.backupRuns.findFirst({
    where: (table, operators) => operators.eq(table.id, runId),
  });

  if (!saved) {
    throw new HttpError(404, "Backup run could not be loaded after execution.");
  }

  return saved;
}

export async function runBackupNow(actorUserId?: string | null, trigger: BackupRun["trigger"] = "manual") {
  const { config: rawConfig } = await readSettingsSection("backups");
  const config = rawConfig as CompatibleBackupSettings;
  const artifactStorage = config.artifactStorage ?? "filesystem";
  const storagePrefix = config.storagePrefix ?? "backups";
  if (!config.enabled) {
    throw new HttpError(400, "Backups are disabled in settings.");
  }

  const destinationDir = resolve(process.cwd(), config.directoryPath);
  await mkdir(destinationDir, { recursive: true });

  const startedAt = new Date();
  const extension = config.format === "custom" ? "dump" : "sql";
  const fileName = `authend-backup-${startedAt.toISOString().replaceAll(":", "-")}.${extension}`;
  const localFilePath = resolve(destinationDir, fileName);
  const runId = crypto.randomUUID();

  await db.insert(backupRuns).values({
    id: runId,
    status: "running",
    trigger,
    destination: artifactStorage,
    filePath: artifactStorage === "filesystem" ? localFilePath : buildBackupStorageKey(storagePrefix, fileName),
    details: {
      format: config.format,
      verifyOnCreate: config.verifyOnCreate,
      artifactStorage,
    },
    startedAt,
  });

  try {
    const command = [
      config.pgDumpPath,
      `--dbname=${env.DATABASE_URL}`,
      `--file=${localFilePath}`,
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

    const sizeBytes = Number(Bun.file(localFilePath).size ?? 0);
    if (config.verifyOnCreate && sizeBytes <= 0) {
      throw new Error("Backup file was created but is empty.");
    }

    let artifactFilePath = localFilePath;
    let storageKey: string | null = null;
    if (artifactStorage === "storage") {
      storageKey = buildBackupStorageKey(storagePrefix, fileName);
      const body = Buffer.from(await Bun.file(localFilePath).arrayBuffer());
      await writeManagedStorageObject({
        key: storageKey,
        body,
        mimeType: config.format === "custom" ? "application/octet-stream" : "application/sql",
        visibility: "private",
      });
      await unlink(localFilePath).catch(() => {});
      artifactFilePath = storageKey;
    }

    if (config.retentionDays > 0 && artifactStorage === "filesystem") {
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

    if (config.retentionDays > 0 && artifactStorage === "storage") {
      const olderThan = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);
      const oldRuns = await db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt));
      await Promise.all(
        oldRuns
          .filter((row) => {
            const details = (row.details as Record<string, unknown> | null) ?? {};
            return (
              row.id !== runId &&
              row.status === "succeeded" &&
              row.filePath &&
              row.startedAt < olderThan &&
              details.operation === "backup" &&
              details.artifactStorage === "storage"
            );
          })
          .map(async (row) => {
            await removeStoredFile(row.filePath!).catch(() => {});
          }),
      );
    }

    await completeBackupRun(runId, {
      status: "succeeded",
      sizeBytes,
      details: {
        format: config.format,
        verifyOnCreate: config.verifyOnCreate,
        artifactStorage,
        storageKey,
        stdout: stdout.trim() || null,
        operation: "backup",
      },
    });

    await db
      .update(backupRuns)
      .set({
        filePath: artifactFilePath,
      })
      .where(eq(backupRuns.id, runId));

    logger.info("backup.completed", { runId, filePath: artifactFilePath, sizeBytes, trigger, actorUserId: actorUserId ?? null });
    await writeAuditLog({
      action: "backup.created",
      actorUserId,
      target: runId,
      payload: {
        filePath: artifactFilePath,
        trigger,
        sizeBytes,
        artifactStorage,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed";
    await completeBackupRun(runId, {
      status: "failed",
      error: message,
    });

    logger.error("backup.failed", { runId, trigger, error: message, actorUserId: actorUserId ?? null });
    await writeAuditLog({
      action: "backup.failed",
      actorUserId,
      target: runId,
      payload: {
        filePath: artifactStorage === "filesystem" ? localFilePath : buildBackupStorageKey(storagePrefix, fileName),
        trigger,
        error: message,
        artifactStorage,
      },
    });
  }

  const saved = await loadBackupRunOrThrow(runId);
  return serialiseBackupRun(saved);
}

export async function restoreBackupNow(sourceRunId: string, actorUserId?: string | null) {
  const { config: rawConfig } = await readSettingsSection("backups");
  const config = rawConfig as CompatibleBackupSettings;
  const sourceRun = await db.query.backupRuns.findFirst({
    where: (table, operators) => operators.eq(table.id, sourceRunId),
  });

  if (!sourceRun) {
    throw new HttpError(404, `Unknown backup run ${sourceRunId}`);
  }
  if (sourceRun.status !== "succeeded") {
    throw new HttpError(400, "Only successful backups can be restored.");
  }
  if (!sourceRun.filePath) {
    throw new HttpError(400, "This backup run does not have a restoreable file path.");
  }
  const sourceDetails = (sourceRun.details as Record<string, unknown> | null) ?? {};
  const sourceArtifactStorage = sourceDetails.artifactStorage === "storage" ? "storage" : "filesystem";

  const startedAt = new Date();
  const runId = crypto.randomUUID();
  await db.insert(backupRuns).values({
    id: runId,
    status: "running",
    trigger: "manual",
    destination: "database",
    filePath: sourceRun.filePath,
    details: {
      operation: "restore",
      sourceRunId,
      sourceStartedAt: sourceRun.startedAt.toISOString(),
      artifactStorage: sourceArtifactStorage,
    },
    startedAt,
  });

  await writeAuditLog({
    action: "backup.restore.started",
    actorUserId,
    target: runId,
    payload: {
      sourceRunId,
      filePath: sourceRun.filePath,
    },
  });

  try {
    const extension = extname(sourceRun.filePath).toLowerCase();
    const isCustomArchive = extension === ".dump";
    const localRestorePath =
      sourceArtifactStorage === "filesystem"
        ? sourceRun.filePath
        : resolve(process.cwd(), config.directoryPath, `restore-${runId}${extension || ".sql"}`);

    if (sourceArtifactStorage === "storage") {
      const body = await readStoredObjectBuffer(sourceRun.filePath);
      await mkdir(dirname(localRestorePath), { recursive: true });
      await Bun.write(localRestorePath, body);
    } else {
      const sourceFile = Bun.file(sourceRun.filePath);
      if (!(await sourceFile.exists())) {
        throw new HttpError(404, "Backup file no longer exists on disk.");
      }
    }

    const command = isCustomArchive
      ? [
          config.pgRestorePath,
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-privileges",
          `--dbname=${env.DATABASE_URL}`,
          localRestorePath,
        ]
      : ["psql", env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", localRestorePath];

    const subprocess = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    const exitCode = await subprocess.exited;
    const stderr = subprocess.stderr ? await new Response(subprocess.stderr).text() : "";
    const stdout = subprocess.stdout ? await new Response(subprocess.stdout).text() : "";

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `restore command exited with code ${exitCode}`);
    }

    await completeBackupRun(runId, {
      status: "succeeded",
      details: {
        operation: "restore",
        sourceRunId,
        sourceStartedAt: sourceRun.startedAt.toISOString(),
        artifactStorage: sourceArtifactStorage,
        command: isCustomArchive ? "pg_restore" : "psql",
        stdout: stdout.trim() || null,
      },
    });
    logger.warn("backup.restore.completed", { runId, sourceRunId, filePath: sourceRun.filePath, actorUserId: actorUserId ?? null });
    await writeAuditLog({
      action: "backup.restore.completed",
      actorUserId,
      target: runId,
      payload: {
        sourceRunId,
        filePath: sourceRun.filePath,
        artifactStorage: sourceArtifactStorage,
      },
    });

    if (sourceArtifactStorage === "storage") {
      await unlink(localRestorePath).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore failed";
    await completeBackupRun(runId, {
      status: "failed",
      error: message,
    });
    logger.error("backup.restore.failed", { runId, sourceRunId, error: message, actorUserId: actorUserId ?? null });
    await writeAuditLog({
      action: "backup.restore.failed",
      actorUserId,
      target: runId,
      payload: {
        sourceRunId,
        filePath: sourceRun.filePath,
        error: message,
        artifactStorage: sourceArtifactStorage,
      },
    });
  }

  return serialiseBackupRun(await loadBackupRunOrThrow(runId));
}
