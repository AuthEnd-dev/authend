import { readdir, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { CronJob, CronJobInput, CronRun } from "@authend/shared";
import { cronJobInputSchema } from "@authend/shared";
import { db, sql } from "../db/client";
import { cronJobs, cronRuns } from "../db/schema/system";
import { HttpError } from "../lib/http";
import { logger } from "../lib/logger";
import { runBackupNow } from "./backup-service";
import { readSettingsSection } from "./settings-store";
import { writeAuditLog } from "./audit-service";

type CronTrigger = CronRun["trigger"];

let schedulerStarted = false;

function serialiseCronJob(row: typeof cronJobs.$inferSelect): CronJob {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    handler: row.handler as CronJob["handler"],
    schedule: row.schedule,
    enabled: row.enabled,
    timeoutSeconds: Number(row.timeoutSeconds),
    concurrencyPolicy: row.concurrencyPolicy as CronJob["concurrencyPolicy"],
    config: (row.config as Record<string, unknown>) ?? {},
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serialiseCronRun(
  row: typeof cronRuns.$inferSelect & {
    jobName?: string | null;
  },
): CronRun {
  return {
    id: row.id,
    jobId: row.jobId,
    jobName: row.jobName ?? "Unknown job",
    status: row.status as CronRun["status"],
    trigger: row.trigger as CronRun["trigger"],
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs ? Number(row.durationMs) : null,
    output: (row.output as Record<string, unknown>) ?? {},
    error: row.error,
  };
}

function parseCronPart(part: string, min: number, max: number) {
  const values = new Set<number>();
  const segments = part.split(",");

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed === "*") {
      for (let value = min; value <= max; value += 1) {
        values.add(value);
      }
      continue;
    }

    const [rangePart, stepPart] = trimmed.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new HttpError(400, `Invalid cron step "${trimmed}"`);
    }

    if (rangePart === "*") {
      for (let value = min; value <= max; value += step) {
        values.add(value);
      }
      continue;
    }

    const rangeValues = rangePart.split("-");
    if (rangeValues.length === 1) {
      const value = Number(rangeValues[0]);
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new HttpError(400, `Invalid cron value "${trimmed}"`);
      }
      values.add(value);
      continue;
    }

    const start = Number(rangeValues[0]);
    const end = Number(rangeValues[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start < min || end > max) {
      throw new HttpError(400, `Invalid cron range "${trimmed}"`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  return values;
}

function matchesCron(schedule: string, date: Date) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new HttpError(400, "Cron schedule must have 5 fields: minute hour day month weekday");
  }

  const [minutes, hours, days, months, weekdays] = parts;
  return (
    parseCronPart(minutes, 0, 59).has(date.getMinutes()) &&
    parseCronPart(hours, 0, 23).has(date.getHours()) &&
    parseCronPart(days, 1, 31).has(date.getDate()) &&
    parseCronPart(months, 1, 12).has(date.getMonth() + 1) &&
    parseCronPart(weekdays, 0, 6).has(date.getDay())
  );
}

export function nextCronOccurrence(schedule: string, from = new Date()) {
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let index = 0; index < 60 * 24 * 366; index += 1) {
    if (matchesCron(schedule, candidate)) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new HttpError(400, `Cron schedule "${schedule}" does not produce an occurrence within one year`);
}

async function recordSkippedRun(job: typeof cronJobs.$inferSelect, trigger: CronTrigger, reason: string) {
  const startedAt = new Date();
  const completedAt = new Date();
  const runId = crypto.randomUUID();

  await db.insert(cronRuns).values({
    id: runId,
    jobId: job.id,
    status: "skipped",
    trigger,
    output: { reason },
    error: null,
    startedAt,
    completedAt,
    durationMs: "0",
  });

  return serialiseCronRun({
    id: runId,
    jobId: job.id,
    status: "skipped",
    trigger,
    output: { reason },
    error: null,
    startedAt,
    completedAt,
    durationMs: "0",
    jobName: job.name,
  });
}

async function cleanupStorageFiles(rootPath: string, olderThanMs: number) {
  const entries = await readdir(rootPath, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    const entryPath = resolve(rootPath, entry.name);
    if (entry.isDirectory()) {
      removed += await cleanupStorageFiles(entryPath, olderThanMs);
      continue;
    }

    const metadata = await stat(entryPath);
    if (Date.now() - metadata.mtimeMs >= olderThanMs) {
      await unlink(entryPath);
      removed += 1;
    }
  }

  return removed;
}

async function executeCronHandler(job: typeof cronJobs.$inferSelect) {
  switch (job.handler) {
    case "backup.run": {
      const backup = await runBackupNow(null, "cron");
      if (backup.status !== "succeeded") {
        throw new Error(backup.error ?? "Backup job failed");
      }
      return { backupRunId: backup.id, filePath: backup.filePath, sizeBytes: backup.sizeBytes };
    }
    case "audit.prune": {
      const { config } = await readSettingsSection("observability");
      const retentionDays =
        typeof (job.config as Record<string, unknown>)?.retentionDays === "number"
          ? Number((job.config as Record<string, unknown>).retentionDays)
          : config.auditRetentionDays;
      const [result] = await sql<{ count: string }[]>`
        with deleted as (
          delete from audit_logs
          where created_at < now() - (${retentionDays} || ' days')::interval
          returning 1
        )
        select count(*)::text as count from deleted
      `;
      return { deleted: Number(result?.count ?? 0), retentionDays };
    }
    case "sessions.pruneExpired": {
      const [result] = await sql<{ count: string }[]>`
        with deleted as (
          delete from session
          where expires_at < now()
          returning 1
        )
        select count(*)::text as count from deleted
      `;
      return { deleted: Number(result?.count ?? 0) };
    }
    case "storage.cleanup": {
      const { config } = await readSettingsSection("storage");
      if (!config.retentionDays) {
        return { deleted: 0, skipped: true, reason: "Storage retention is not configured." };
      }
      const rootPath = resolve(process.cwd(), config.rootPath);
      const olderThanMs = config.retentionDays * 24 * 60 * 60 * 1000;
      const deleted = await cleanupStorageFiles(rootPath, olderThanMs);
      return { deleted, retentionDays: config.retentionDays };
    }
    default:
      throw new HttpError(400, `Unsupported cron handler ${job.handler}`);
  }
}

async function acquireJobLock(jobId: string) {
  const [row] = await sql<{ locked: boolean }[]>`
    select pg_try_advisory_lock(hashtext('authend_cron_job'), hashtext(${jobId})) as locked
  `;
  return row?.locked === true;
}

async function releaseJobLock(jobId: string) {
  await sql`
    select pg_advisory_unlock(hashtext('authend_cron_job'), hashtext(${jobId}))
  `;
}

export async function listCronJobs() {
  const rows = await db.select().from(cronJobs).orderBy(asc(cronJobs.name));
  return rows.map(serialiseCronJob);
}

export async function listCronRuns(limit = 25) {
  const rows = await db
    .select({
      id: cronRuns.id,
      jobId: cronRuns.jobId,
      status: cronRuns.status,
      trigger: cronRuns.trigger,
      output: cronRuns.output,
      error: cronRuns.error,
      startedAt: cronRuns.startedAt,
      completedAt: cronRuns.completedAt,
      durationMs: cronRuns.durationMs,
      jobName: cronJobs.name,
    })
    .from(cronRuns)
    .leftJoin(cronJobs, eq(cronJobs.id, cronRuns.jobId))
    .orderBy(desc(cronRuns.startedAt))
    .limit(limit);

  return rows.map(serialiseCronRun);
}

export async function createCronJob(input: CronJobInput, actorUserId?: string | null) {
  const parsed = cronJobInputSchema.parse(input);
  const nextRunAt = parsed.enabled ? nextCronOccurrence(parsed.schedule) : null;
  const id = crypto.randomUUID();

  await db.insert(cronJobs).values({
    id,
    name: parsed.name,
    description: parsed.description ?? null,
    handler: parsed.handler,
    schedule: parsed.schedule,
    enabled: parsed.enabled,
    timeoutSeconds: String(parsed.timeoutSeconds),
    concurrencyPolicy: parsed.concurrencyPolicy,
    config: parsed.config,
    nextRunAt,
  });

  await writeAuditLog({
    action: "cron.job.created",
    actorUserId,
    target: id,
    payload: { name: parsed.name, handler: parsed.handler, schedule: parsed.schedule },
  });

  const saved = await db.query.cronJobs.findFirst({
    where: (table, operators) => operators.eq(table.id, id),
  });

  if (!saved) {
    throw new HttpError(500, "Cron job could not be loaded after creation.");
  }

  return serialiseCronJob(saved);
}

export async function updateCronJob(jobId: string, input: Partial<CronJobInput>, actorUserId?: string | null) {
  const existing = await db.query.cronJobs.findFirst({
    where: (table, operators) => operators.eq(table.id, jobId),
  });

  if (!existing) {
    throw new HttpError(404, `Unknown cron job ${jobId}`);
  }

  const parsed = cronJobInputSchema.parse({
    name: existing.name,
    description: existing.description,
    handler: existing.handler,
    schedule: existing.schedule,
    enabled: existing.enabled,
    timeoutSeconds: Number(existing.timeoutSeconds),
    concurrencyPolicy: existing.concurrencyPolicy,
    config: existing.config,
    ...input,
  });

  const nextRunAt = parsed.enabled ? nextCronOccurrence(parsed.schedule) : null;

  await db
    .update(cronJobs)
    .set({
      name: parsed.name,
      description: parsed.description ?? null,
      handler: parsed.handler,
      schedule: parsed.schedule,
      enabled: parsed.enabled,
      timeoutSeconds: String(parsed.timeoutSeconds),
      concurrencyPolicy: parsed.concurrencyPolicy,
      config: parsed.config,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(cronJobs.id, jobId));

  await writeAuditLog({
    action: "cron.job.updated",
    actorUserId,
    target: jobId,
    payload: { name: parsed.name, handler: parsed.handler, schedule: parsed.schedule },
  });

  const saved = await db.query.cronJobs.findFirst({
    where: (table, operators) => operators.eq(table.id, jobId),
  });

  if (!saved) {
    throw new HttpError(500, "Cron job could not be loaded after update.");
  }

  return serialiseCronJob(saved);
}

export async function deleteCronJob(jobId: string, actorUserId?: string | null) {
  const existing = await db.query.cronJobs.findFirst({
    where: (table, operators) => operators.eq(table.id, jobId),
  });
  if (!existing) {
    throw new HttpError(404, `Unknown cron job ${jobId}`);
  }

  await db.delete(cronJobs).where(eq(cronJobs.id, jobId));
  await writeAuditLog({
    action: "cron.job.deleted",
    actorUserId,
    target: jobId,
    payload: { name: existing.name },
  });
}

export async function runCronJob(jobId: string, actorUserId?: string | null, trigger: CronTrigger = "manual") {
  const job = await db.query.cronJobs.findFirst({
    where: (table, operators) => operators.eq(table.id, jobId),
  });

  if (!job) {
    throw new HttpError(404, `Unknown cron job ${jobId}`);
  }

  const runningCount = await db.query.cronRuns.findFirst({
    where: (table, operators) =>
      and(
        operators.eq(table.jobId, jobId),
        operators.eq(table.status, "running"),
      ),
  });

  if (job.concurrencyPolicy === "skip" && runningCount) {
    return recordSkippedRun(job, trigger, "A previous run is still in progress.");
  }

  const lockAcquired = await acquireJobLock(jobId);
  if (!lockAcquired) {
    return recordSkippedRun(job, trigger, "Another scheduler instance already owns this job lock.");
  }

  const startedAt = new Date();
  const runId = crypto.randomUUID();

  try {
    await db.insert(cronRuns).values({
      id: runId,
      jobId,
      status: "running",
      trigger,
      output: {},
      startedAt,
    });

    const output = await executeCronHandler(job);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const nextRunAt = job.enabled ? nextCronOccurrence(job.schedule, completedAt) : null;

    await db
      .update(cronRuns)
      .set({
        status: "succeeded",
        output,
        completedAt,
        durationMs: String(durationMs),
      })
      .where(eq(cronRuns.id, runId));

    await db
      .update(cronJobs)
      .set({
        lastRunAt: completedAt,
        nextRunAt,
        updatedAt: completedAt,
      })
      .where(eq(cronJobs.id, jobId));

    logger.info("cron.run.completed", { jobId, runId, trigger, handler: job.handler });
  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const message = error instanceof Error ? error.message : "Cron job failed";

    await db
      .update(cronRuns)
      .set({
        status: "failed",
        error: message,
        completedAt,
        durationMs: String(durationMs),
      })
      .where(eq(cronRuns.id, runId));

    await db
      .update(cronJobs)
      .set({
        lastRunAt: completedAt,
        nextRunAt: job.enabled ? nextCronOccurrence(job.schedule, completedAt) : null,
        updatedAt: completedAt,
      })
      .where(eq(cronJobs.id, jobId));

    logger.error("cron.run.failed", { jobId, runId, trigger, error: message, handler: job.handler });
  } finally {
    await releaseJobLock(jobId);
  }

  const saved = await db
    .select({
      id: cronRuns.id,
      jobId: cronRuns.jobId,
      status: cronRuns.status,
      trigger: cronRuns.trigger,
      output: cronRuns.output,
      error: cronRuns.error,
      startedAt: cronRuns.startedAt,
      completedAt: cronRuns.completedAt,
      durationMs: cronRuns.durationMs,
      jobName: cronJobs.name,
    })
    .from(cronRuns)
    .leftJoin(cronJobs, eq(cronJobs.id, cronRuns.jobId))
    .where(eq(cronRuns.id, runId));

  if (!saved[0]) {
    throw new HttpError(500, "Cron run could not be loaded after execution.");
  }

  return serialiseCronRun(saved[0]);
}

export async function listCronDiagnostics() {
  const { config } = await readSettingsSection("crons");
  const dueJobs = await db
    .select({ id: cronJobs.id })
    .from(cronJobs)
    .where(and(eq(cronJobs.enabled, true), lte(cronJobs.nextRunAt, new Date())));

  return {
    schedulerStarted,
    schedulerEnabled: config.schedulerEnabled,
    tickSeconds: config.tickSeconds,
    dueJobs: dueJobs.length,
    supportedHandlers: ["backup.run", "audit.prune", "sessions.pruneExpired", "storage.cleanup"],
  };
}

async function tickScheduler() {
  const { config } = await readSettingsSection("crons");
  if (!config.schedulerEnabled) {
    return;
  }

  const jobs = await db
    .select()
    .from(cronJobs)
    .where(and(eq(cronJobs.enabled, true), lte(cronJobs.nextRunAt, new Date())))
    .orderBy(asc(cronJobs.nextRunAt))
    .limit(config.maxConcurrentRuns);

  for (const job of jobs) {
    void runCronJob(job.id, null, "scheduled");
  }
}

async function scheduleNextTick() {
  if (!schedulerStarted) {
    return;
  }

  const { config } = await readSettingsSection("crons");
  const delay = Math.max(5, config.tickSeconds) * 1000;
  const timer = setTimeout(() => {
    void tickScheduler()
      .catch((error) => {
        logger.error("cron.scheduler.tick_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        void scheduleNextTick();
      });
  }, delay);
  timer.unref?.();
}

export function startCronScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  void tickScheduler();
  void scheduleNextTick();
  logger.info("cron.scheduler.started");
}
