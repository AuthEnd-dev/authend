import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import type {
  BackupSettingsResponse,
  CronJobInput,
  CronSettingsResponse,
  EnvironmentEditorState,
  SettingsSectionConfigMap,
  SettingsSectionId,
  SettingsSectionState,
  StorageSettingsResponse,
  WebhooksSettingsResponse,
} from "@authend/shared";
import { settingsSectionIdSchema } from "@authend/shared";
import { env } from "../config/env";
import { listBackupRuns } from "./backup-service";
import { createCronJob, deleteCronJob, listCronDiagnostics, listCronJobs, listCronRuns, runCronJob, updateCronJob } from "./cron-service";
import { listPluginCapabilityManifests, readPluginCapabilityManifest } from "./plugin-service";
import { invalidateAuth } from "./auth-service";
import { readSettingsSection, writeSettingsSection } from "./settings-store";
import { writeAuditLog } from "./audit-service";
import { REDACTED_VALUE } from "../lib/redaction";
import { verifyEmailTransport } from "../lib/email";
import { probeStorageConnection } from "./storage-service";
import { listRecentDeliveries, listWebhooks } from "./webhook-service";

const CORE_ENV_KEYS = ["APP_URL", "DATABASE_URL", "BETTER_AUTH_SECRET", "SUPERADMIN_EMAIL", "SUPERADMIN_PASSWORD"];
const ENV_FILE_PATH = resolve(process.cwd(), ".env");
type DiagnosticStatus = "healthy" | "warning" | "error";

type DiagnosticCheck = {
  label: string;
  status: DiagnosticStatus;
  value?: string | number | boolean | null;
  detail?: string;
};

type CompatibleApiRateLimitSettings = {
  publicRateLimitPerMinute?: number;
  sessionRateLimitPerMinute?: number;
  apiKeyRateLimitPerMinute?: number;
  defaultRateLimitPerMinute: number;
  maxRateLimitPerMinute: number;
};

type CompatibleBackupSettings = {
  artifactStorage?: "filesystem" | "storage";
  storagePrefix?: string;
};

type DiagnosticIssue = {
  severity: "warning" | "error";
  title: string;
  reason: string;
  fix: string;
};

function envValue(key: string) {
  const value = process.env[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  const known = (env as Record<string, unknown>)[key];
  if (typeof known === "string" && known.length > 0) {
    return known;
  }

  return undefined;
}

function buildActionableDiagnostics(input: {
  title: string;
  healthyDescription: string;
  warningDescription?: string;
  errorDescription?: string;
  checks: DiagnosticCheck[];
  nextSteps?: string[];
  issues?: DiagnosticIssue[];
}) {
  const hasError = input.checks.some((check) => check.status === "error");
  const hasWarning = input.checks.some((check) => check.status === "warning");
  const status: DiagnosticStatus = hasError ? "error" : hasWarning ? "warning" : "healthy";
  const description =
    status === "error"
      ? input.errorDescription ?? input.warningDescription ?? input.healthyDescription
      : status === "warning"
        ? input.warningDescription ?? input.healthyDescription
        : input.healthyDescription;

  return {
    summary: {
      status,
      title: input.title,
      description,
    },
    checks: input.checks,
    issues: input.issues ?? [],
    nextSteps: input.nextSteps ?? [],
  } satisfies Record<string, unknown>;
}

async function storageDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("storage");
  const checks: DiagnosticCheck[] = [
    {
      label: "Storage driver",
      status: "healthy",
      value: config.driver,
      detail: config.driver === "local" ? "Using the project filesystem for object storage." : "Using an S3-compatible object store.",
    },
  ];
  const nextSteps: string[] = [];
  const issues: DiagnosticIssue[] = [];

  if (config.driver === "local") {
    const absoluteRoot = resolve(process.cwd(), config.rootPath);
    const testFile = resolve(absoluteRoot, ".authend-storage-healthcheck");

    let writable = false;
    let error: string | null = null;

    try {
      await mkdir(absoluteRoot, { recursive: true });
      await Bun.write(testFile, "ok");
      await unlink(testFile);
      writable = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Storage path check failed";
    }

    checks.push({
      label: "Filesystem path",
      status: writable ? "healthy" : "error",
      value: absoluteRoot,
      detail: writable ? "AuthEnd can create and remove a healthcheck file in the configured directory." : error ?? "Storage path is not writable.",
    });
    if (!writable) {
      issues.push({
        severity: "error",
        title: "Uploads will fail because the storage directory is not writable",
        reason: error ?? "AuthEnd could not create and remove a healthcheck file in the configured local storage directory.",
        fix: `Update the local storage path or fix filesystem permissions for ${absoluteRoot}.`,
      });
    }
  } else {
    const credentialsConfigured = Boolean(config.accessKeyId && config.secretAccessKey);
    const bucketConfigured = Boolean(config.bucket);
    const regionConfigured = Boolean(config.region);

    checks.push(
      {
        label: "Bucket",
        status: bucketConfigured ? "healthy" : "error",
        value: config.bucket || null,
        detail: bucketConfigured ? "Bucket name is configured." : "Set the bucket name before uploads can succeed.",
      },
      {
        label: "Credentials",
        status: credentialsConfigured ? "healthy" : "error",
        value: credentialsConfigured,
        detail: credentialsConfigured ? "Access key and secret are configured." : "Add access key and secret access key for the object store.",
      },
      {
        label: "Region",
        status: regionConfigured ? "healthy" : "warning",
        value: config.region || null,
        detail: regionConfigured ? "Region is configured." : "Region is blank. Some S3-compatible providers require it explicitly.",
      },
      {
        label: "Endpoint",
        status: config.endpoint ? "healthy" : "warning",
        value: config.endpoint || null,
        detail: config.endpoint ? "Custom endpoint configured for the storage provider." : "Using the provider default endpoint. Leave blank only when that is intentional.",
      },
    );

    if (credentialsConfigured && bucketConfigured && regionConfigured) {
      const probe = await probeStorageConnection();
      checks.push({
        label: "Bucket probe",
        status: probe.ok ? "healthy" : "error",
        value: probe.ok ? "reachable" : "failed",
        detail: probe.detail,
      });
      if (!probe.ok) {
        nextSteps.push("Fix object storage connectivity or permissions, then reload diagnostics.");
        issues.push({
          severity: "error",
          title: "Storage credentials are configured, but the bucket probe failed",
          reason: probe.detail,
          fix: "Verify bucket permissions, endpoint, region, and network reachability for the configured object store.",
        });
      }
    }
  }

  if (config.driver === "local" && !config.rootPath.trim()) {
    nextSteps.push("Set a root path for local storage before enabling uploads.");
    issues.push({
      severity: "error",
      title: "Uploads will fail because no local storage path is configured",
      reason: "The local storage driver is selected, but the root path is blank.",
      fix: "Set a root path under File Storage and save the settings.",
    });
  }
  if (config.driver === "s3") {
    if (!config.bucket.trim()) {
      nextSteps.push("Add the S3 bucket name.");
      issues.push({
        severity: "error",
        title: "Uploads will fail because the S3 bucket is missing",
        reason: "The S3-compatible driver needs a bucket name for object writes and reads.",
        fix: "Enter the bucket name in File Storage settings and save the configuration.",
      });
    }
    if (!config.accessKeyId.trim() || !config.secretAccessKey.trim()) {
      nextSteps.push("Add object storage credentials.");
      issues.push({
        severity: "error",
        title: "Uploads will fail because object storage credentials are missing",
        reason: "The S3-compatible driver cannot authenticate without both access key ID and secret access key.",
        fix: "Add the object storage credentials in File Storage settings.",
      });
    }
    if (!config.region.trim()) {
      issues.push({
        severity: "warning",
        title: "Storage may fail against providers that require an explicit region",
        reason: "The region field is blank. Some S3-compatible providers accept this, others reject requests.",
        fix: "Set the region expected by your object storage provider.",
      });
    }
  }

  return {
    section: "storage" as const,
    config,
    updatedAt,
    diagnostics: buildActionableDiagnostics({
      title: "Storage readiness",
      healthyDescription: "Storage is configured for uploads and signed URLs.",
      warningDescription: "Storage works, but some configuration details should be reviewed before production use.",
      errorDescription: "Storage is not ready for reliable uploads yet.",
      checks,
      issues,
      nextSteps,
    }),
  } satisfies StorageSettingsResponse;
}

async function backupDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("backups");
  const compatibleConfig = config as typeof config & CompatibleBackupSettings;
  const runs = await listBackupRuns(15);

  const commandAvailable = (command: string) => {
    try {
      return Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "pipe" }).success;
    } catch {
      return false;
    }
  };

  const latestRun = runs[0];
  const checks: DiagnosticCheck[] = [
    {
      label: "Artifact destination",
      status: "healthy",
      value: compatibleConfig.artifactStorage ?? "filesystem",
      detail:
        compatibleConfig.artifactStorage === "storage"
          ? "Backup archives are staged locally, then copied into configured storage."
          : "Backup archives are kept on the local filesystem.",
    },
    {
      label: "Backups enabled",
      status: config.enabled ? "healthy" : "warning",
      value: config.enabled,
      detail: config.enabled ? "Manual and cron-triggered backups are allowed." : "Backups are disabled, so no new archives will be created.",
    },
    {
      label: "Backup directory",
      status: config.directoryPath.trim() ? "healthy" : "error",
      value: resolve(process.cwd(), config.directoryPath),
      detail: config.directoryPath.trim() ? "Backup archives will be written here." : "Set a directory path for backup output.",
    },
    {
      label: "pg_dump",
      status: commandAvailable(config.pgDumpPath) ? "healthy" : "error",
      value: config.pgDumpPath,
      detail: commandAvailable(config.pgDumpPath)
        ? "Backup creation command is available."
        : "The configured pg_dump binary could not be executed.",
    },
    {
      label: "pg_restore",
      status: commandAvailable(config.pgRestorePath) ? "healthy" : "warning",
      value: config.pgRestorePath,
      detail: commandAvailable(config.pgRestorePath)
        ? "Restore command is available for recovery drills."
        : "The configured pg_restore binary could not be executed.",
    },
    {
      label: "Latest run",
      status:
        latestRun?.status === "failed"
          ? "error"
          : latestRun?.status === "running"
            ? "warning"
            : latestRun
              ? "healthy"
              : "warning",
      value: latestRun?.status ?? "none",
      detail: latestRun
        ? latestRun.error ?? `Last backup started at ${latestRun.startedAt}.`
        : "No backup runs recorded yet.",
    },
  ];
  const nextSteps: string[] = [];
  const issues: DiagnosticIssue[] = [];
  if (!config.enabled) {
    nextSteps.push("Enable backups before relying on cron or manual recovery workflows.");
    issues.push({
      severity: "warning",
      title: "No new backups will be created because backups are disabled",
      reason: "Manual and scheduled backup runs are blocked when backups are turned off.",
      fix: "Enable backups in the Backups settings before relying on recovery workflows.",
    });
  }
  if (compatibleConfig.artifactStorage === "storage" && !(compatibleConfig.storagePrefix ?? "").trim()) {
    nextSteps.push("Set a storage prefix for backup artifacts.");
    issues.push({
      severity: "error",
      title: "Backups cannot be stored in object storage without a prefix",
      reason: "Storage-backed backups are enabled, but the storage prefix is blank.",
      fix: "Set a backup storage prefix so archives can be written to the configured storage backend.",
    });
  }
  if (!commandAvailable(config.pgDumpPath)) {
    nextSteps.push(`Install or correct the pg_dump path (${config.pgDumpPath}).`);
    issues.push({
      severity: "error",
      title: "Backup creation will fail because pg_dump is unavailable",
      reason: `AuthEnd could not execute the configured pg_dump binary at ${config.pgDumpPath}.`,
      fix: "Install pg_dump or update the configured path to a working binary.",
    });
  }
  if (latestRun?.status === "failed") {
    nextSteps.push("Inspect the latest backup failure and run a manual backup after fixing the command or database access.");
    issues.push({
      severity: "error",
      title: "The latest backup run failed",
      reason: latestRun.error ?? "The most recent backup did not complete successfully.",
      fix: "Correct the failing dependency or credential, then run a manual backup again to confirm recovery.",
    });
  }
  if (!latestRun) {
    nextSteps.push("Run a manual backup now to verify the configuration before production use.");
    issues.push({
      severity: "warning",
      title: "Backup recovery is unverified because no backup has run yet",
      reason: "The configuration may look valid, but there is no successful backup on record.",
      fix: "Run a manual backup now and confirm the archive is created where you expect.",
    });
  }

  return {
    section: "backups" as const,
    config,
    updatedAt,
    runs,
    diagnostics: buildActionableDiagnostics({
      title: "Backup readiness",
      healthyDescription: "Backup creation is configured and recent runs look healthy.",
      warningDescription: "Backups are partially configured, but you should verify the recovery path before production use.",
      errorDescription: "Backups are not dependable yet.",
      checks,
      issues,
      nextSteps,
    }),
  } satisfies BackupSettingsResponse;
}

async function cronDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("crons");
  const jobs = await listCronJobs();
  const runs = await listCronRuns(25);
  const diagnostics = await listCronDiagnostics();
  const enabledJobs = jobs.filter((job) => job.enabled);
  const latestRun = runs[0];
  const failedRecentRuns = runs.filter((run) => run.status === "failed").length;
  const nextSteps: string[] = [];
  const issues: DiagnosticIssue[] = [];
  if (!config.schedulerEnabled) {
    nextSteps.push("Enable the scheduler if you expect jobs to run automatically.");
    issues.push({
      severity: "warning",
      title: "Cron jobs will not run automatically because the scheduler is disabled",
      reason: "The scheduler toggle is off, so only manual runs are possible.",
      fix: "Enable the scheduler in Crons settings if you want jobs to run on schedule.",
    });
  }
  if (config.schedulerEnabled && !diagnostics.schedulerStarted) {
    nextSteps.push("Restart the API process so the in-process scheduler starts.");
    issues.push({
      severity: "error",
      title: "Scheduled jobs are blocked because the scheduler loop is not running",
      reason: "This API process has scheduler support configured, but the in-process scheduler has not started.",
      fix: "Restart the API process and verify the scheduler starts cleanly.",
    });
  }
  if (enabledJobs.length === 0) {
    nextSteps.push("Create at least one enabled cron job to validate the scheduler.");
    issues.push({
      severity: "warning",
      title: "Nothing will run because there are no enabled cron jobs",
      reason: "The scheduler has no active job definitions to execute.",
      fix: "Create or enable at least one cron job.",
    });
  }
  if (diagnostics.dueJobs > 0) {
    nextSteps.push("Investigate overdue jobs. A backlog usually means the scheduler is paused, blocked, or underprovisioned.");
    issues.push({
      severity: "warning",
      title: "Some jobs are overdue and waiting to run",
      reason: `${diagnostics.dueJobs} enabled job(s) are due right now and have not executed yet.`,
      fix: "Check whether the scheduler is running, whether concurrency limits are too low, or whether a previous run is blocking progress.",
    });
  }
  if (failedRecentRuns > 0) {
    issues.push({
      severity: "warning",
      title: "Recent cron runs have failed",
      reason: `${failedRecentRuns} recent cron run(s) failed.`,
      fix: "Inspect the recent run history below, fix the failing handler or dependency, then rerun the job manually.",
    });
  }

  return {
    section: "crons" as const,
    config,
    updatedAt,
    jobs,
    runs,
    diagnostics: buildActionableDiagnostics({
      title: "Scheduler readiness",
      healthyDescription: "The scheduler is running with active jobs and no visible backlog.",
      warningDescription: "The scheduler is configured, but there are gaps you should review.",
      errorDescription: "The scheduler is not in a healthy state for automated jobs.",
      checks: [
        {
          label: "Scheduler enabled",
          status: config.schedulerEnabled ? "healthy" : "warning",
          value: config.schedulerEnabled,
          detail: config.schedulerEnabled ? "Automatic job execution is enabled." : "Jobs will run only when triggered manually.",
        },
        {
          label: "Scheduler process",
          status: diagnostics.schedulerStarted ? "healthy" : "error",
          value: diagnostics.schedulerStarted,
          detail: diagnostics.schedulerStarted ? "The in-process scheduler loop is running." : "The scheduler loop is not running in this API process.",
        },
        {
          label: "Enabled jobs",
          status: enabledJobs.length > 0 ? "healthy" : "warning",
          value: enabledJobs.length,
          detail: enabledJobs.length > 0 ? "At least one job is enabled." : "No enabled cron jobs are currently scheduled.",
        },
        {
          label: "Overdue jobs",
          status: diagnostics.dueJobs === 0 ? "healthy" : "warning",
          value: diagnostics.dueJobs,
          detail:
            diagnostics.dueJobs === 0
              ? "No jobs are currently overdue."
              : `${diagnostics.dueJobs} enabled job(s) are due right now and waiting to run.`,
        },
        {
          label: "Recent failures",
          status: failedRecentRuns === 0 ? "healthy" : "warning",
          value: failedRecentRuns,
          detail:
            failedRecentRuns === 0
              ? "No failed cron runs in the recent history."
              : `${failedRecentRuns} recent cron run(s) failed. Inspect the run history below.`,
        },
        {
          label: "Latest run",
          status:
            latestRun?.status === "failed"
              ? "error"
              : latestRun?.status === "skipped"
                ? "warning"
                : latestRun
                  ? "healthy"
                  : "warning",
          value: latestRun?.status ?? "none",
          detail: latestRun
            ? latestRun.error ?? `${latestRun.jobName} last ran at ${latestRun.startedAt}.`
            : "No cron runs recorded yet.",
        },
      ],
      issues,
      nextSteps,
    }),
  } satisfies CronSettingsResponse;
}

async function webhooksDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("webhooks");
  const webhooksList = await listWebhooks();
  const recentDeliveries = await listRecentDeliveries(25);
  const redactedWebhooks = webhooksList.map((webhook) => ({
    ...webhook,
    secret: webhook.secret ? REDACTED_VALUE : webhook.secret,
  }));

  return {
    section: "webhooks" as const,
    config,
    updatedAt,
    webhooks: redactedWebhooks,
    recentDeliveries,
    diagnostics: {
      totalWebhooks: redactedWebhooks.length,
      enabledWebhooks: redactedWebhooks.filter((wh) => wh.enabled).length,
      recentDeliveries: recentDeliveries.length,
      recentSucceeded: recentDeliveries.filter((d) => d.status === "succeeded").length,
      recentFailed: recentDeliveries.filter((d) => d.status === "failed" || d.status === "dead").length,
    },
  } satisfies WebhooksSettingsResponse;
}


async function computeRequiredEnvironmentKeys() {
  const state = await readSettingsSection("environmentsSecrets");
  const aiState = await readSettingsSection("aiAssistant");
  const pluginManifests = await listPluginCapabilityManifests();
  const pluginMissingKeys = pluginManifests.flatMap((manifest) => manifest.missingEnvKeys);
  const aiKeys = aiState.config.enabled ? [aiState.config.apiKeyEnvVar] : [];
  const requiredKeys = Array.from(
    new Set([...CORE_ENV_KEYS, ...state.config.additionalRequiredEnvKeys, ...pluginMissingKeys, ...aiKeys]),
  );
  const missingKeys = requiredKeys.filter((key) => !envValue(key));
  return { requiredKeys, missingKeys };
}

export async function getEnvironmentEditorState(): Promise<EnvironmentEditorState> {
  const file = Bun.file(ENV_FILE_PATH);
  const raw = (await file.exists()) ? await file.text() : "";
  const variables = Object.entries(parseDotenv(raw)).map(([name, value]) => ({
    name,
    value,
  }));
  const { requiredKeys, missingKeys } = await computeRequiredEnvironmentKeys();

  return {
    filePath: ENV_FILE_PATH,
    raw,
    variables,
    requiredKeys,
    missingKeys,
    restartRequired: true,
  };
}

export async function saveEnvironmentEditorState(raw: string, actorUserId?: string | null): Promise<EnvironmentEditorState> {
  const previousFile = Bun.file(ENV_FILE_PATH);
  const previousRaw = (await previousFile.exists()) ? await previousFile.text() : "";
  const previousParsed = parseDotenv(previousRaw);
  const nextRaw = raw.endsWith("\n") || raw.length === 0 ? raw : `${raw}\n`;
  const nextParsed = parseDotenv(nextRaw);
  await Bun.write(ENV_FILE_PATH, nextRaw);

  for (const key of Object.keys(previousParsed)) {
    if (!(key in nextParsed)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(nextParsed)) {
    process.env[key] = value;
  }

  await writeAuditLog({
    action: "settings.env.updated",
    actorUserId,
    target: "environmentsSecrets",
    payload: {
      filePath: ENV_FILE_PATH,
    },
  });
  return getEnvironmentEditorState();
}

async function genericDiagnostics(section: Exclude<SettingsSectionId, "storage" | "backups" | "crons">) {
  switch (section) {
    case "general": {
      const state = await readSettingsSection("general");
      return {
        appUrlMatchesEnv: state.config.appUrl === env.APP_URL,
        adminUrl: state.config.adminUrl,
      };
    }
    case "authentication": {
      const state = await readSettingsSection("authentication");
      return {
        passwordPolicy: `${state.config.minPasswordLength}+ chars`,
        passwordCeiling: `${state.config.maxPasswordLength} chars`,
        signUpEnabled: state.config.allowSignUp,
      };
    }
    case "sessionsSecurity": {
      const state = await readSettingsSection("sessionsSecurity");
      return {
        sessionTtlHours: Math.round(state.config.sessionTtlSeconds / 3600),
        admin2faRequired: state.config.enforceTwoFactorForAdmins,
      };
    }
    case "email": {
      const state = await readSettingsSection("email");
      const smtpHost = state.config.smtpHost || env.SMTP_HOST || "";
      const smtpUsername = state.config.smtpUsername || env.SMTP_USER || "";
      const smtpPassword = state.config.smtpPassword || env.SMTP_PASS || "";
      const smtpPort = Number(state.config.smtpPort);
      const checks: DiagnosticCheck[] = [
        {
          label: "SMTP host",
          status: smtpHost ? "healthy" : "error",
          value: smtpHost || null,
          detail: smtpHost ? "SMTP host is configured." : "Set an SMTP host before sending auth emails.",
        },
        {
          label: "SMTP credentials",
          status: smtpUsername && smtpPassword ? "healthy" : "error",
          value: smtpUsername ? "configured" : "missing",
          detail: smtpUsername && smtpPassword ? "SMTP username and password are configured." : "Add SMTP username and password.",
        },
        {
          label: "SMTP port",
          status: Number.isFinite(smtpPort) && smtpPort > 0 ? "healthy" : "warning",
          value: Number.isFinite(smtpPort) ? smtpPort : null,
          detail: Number.isFinite(smtpPort) && smtpPort > 0 ? "Port looks valid." : "Review the SMTP port. Common values are 465 for secure SMTP or 587 for STARTTLS.",
        },
        {
          label: "Sender address",
          status: state.config.senderEmail ? "healthy" : "error",
          value: state.config.senderEmail || null,
          detail: state.config.senderEmail ? "Auth emails will use this sender." : "Set the sender email shown in password reset and verification emails.",
        },
        {
          label: "Test recipient",
          status: state.config.testRecipient ? "healthy" : "warning",
          value: state.config.testRecipient || null,
          detail: state.config.testRecipient
            ? "A test recipient is configured for verification emails."
            : "Add a test recipient so you can verify delivery without editing settings again.",
        },
      ];
      const nextSteps: string[] = [];
      const issues: DiagnosticIssue[] = [];
      if (!smtpHost) {
        nextSteps.push("Set the SMTP host.");
        issues.push({
          severity: "error",
          title: "Auth emails cannot send because the SMTP host is missing",
          reason: "Email delivery requires a reachable SMTP host, but none is configured.",
          fix: "Set the SMTP host in Email settings or provide it through environment variables.",
        });
      }
      if (!smtpUsername || !smtpPassword) {
        nextSteps.push("Add SMTP credentials in settings or environment variables.");
        issues.push({
          severity: "error",
          title: "Auth emails cannot authenticate because SMTP credentials are incomplete",
          reason: "The SMTP username or password is missing.",
          fix: "Add SMTP username and password in Email settings or environment variables.",
        });
      }
      if (!state.config.senderEmail) {
        nextSteps.push("Set the sender email before using password reset or verification flows.");
        issues.push({
          severity: "error",
          title: "Auth emails are not ready because the sender email is missing",
          reason: "Password reset and verification emails need a sender address.",
          fix: "Set the sender email in Email settings.",
        });
      }
      if (!state.config.testRecipient) {
        nextSteps.push("Add a test recipient and send a verification email to confirm delivery.");
        issues.push({
          severity: "warning",
          title: "Email delivery is still unverified",
          reason: "There is no test recipient configured, so operators have no quick way to validate delivery after saving changes.",
          fix: "Set a test recipient and send a verification or reset email to confirm SMTP works.",
        });
      }
      if (smtpHost && smtpUsername && smtpPassword) {
        const probe = await verifyEmailTransport();
        checks.push({
          label: "SMTP probe",
          status: probe.ok ? "healthy" : "error",
          value: probe.ok ? "reachable" : "failed",
          detail: probe.detail,
        });
        if (!probe.ok) {
          nextSteps.push("Fix SMTP connectivity or credentials, then reload diagnostics.");
          issues.push({
            severity: "error",
            title: "SMTP is configured, but AuthEnd could not verify the connection",
            reason: probe.detail,
            fix: "Confirm the SMTP host, port, encryption mode, credentials, and network reachability, then test again.",
          });
        }
      }

      return buildActionableDiagnostics({
        title: "Email readiness",
        healthyDescription: "SMTP settings are configured for auth email flows.",
        warningDescription: "Email is partly configured, but operator validation is still missing.",
        errorDescription: "Email is not ready for password reset and verification flows.",
        checks,
        issues,
        nextSteps,
      });
    }
    case "domainsOrigins": {
      const state = await readSettingsSection("domainsOrigins");
      return {
        trustedOrigins: state.config.trustedOrigins.length,
        corsOrigins: state.config.corsOrigins.length,
      };
    }
    case "api": {
      const state = await readSettingsSection("api");
      const config = state.config as typeof state.config & CompatibleApiRateLimitSettings;
      return {
        defaultAuthMode: state.config.defaultAuthMode,
        publicRateLimitPerMinute: config.publicRateLimitPerMinute ?? config.defaultRateLimitPerMinute,
        sessionRateLimitPerMinute: config.sessionRateLimitPerMinute ?? config.maxRateLimitPerMinute,
        apiKeyRateLimitPerMinute: config.apiKeyRateLimitPerMinute ?? config.maxRateLimitPerMinute,
      };
    }
    case "aiAssistant": {
      const state = await readSettingsSection("aiAssistant");
      return {
        enabled: state.config.enabled,
        provider: state.config.provider,
        baseUrl: state.config.baseUrl,
        model: state.config.model,
        apiKeyEnvVar: state.config.apiKeyEnvVar,
        apiKeyConfigured: Boolean(envValue(state.config.apiKeyEnvVar)),
      };
    }
    case "adminAccess": {
      const state = await readSettingsSection("adminAccess");
      const adminPlugin = await readPluginCapabilityManifest("admin");
      return {
        adminPluginRequired: adminPlugin.required,
        adminPluginEnabled: adminPlugin.installState.enabled,
        adminRoles: state.config.adminRoles,
      };
    }
    case "environmentsSecrets": {
      const { requiredKeys, missingKeys } = await computeRequiredEnvironmentKeys();
      return {
        requiredKeys,
        missingKeys,
        allPresent: missingKeys.length === 0,
      };
    }
    case "observability":
      return readSettingsSection("observability").then((state) => ({
        logLevel: state.config.logLevel,
        auditRetentionDays: state.config.auditRetentionDays,
      }));
    case "dangerZone":
      return readSettingsSection("dangerZone").then((state) => ({
        maintenanceMode: state.config.maintenanceMode,
        destructiveSchemaChanges: state.config.allowDestructiveSchemaChanges,
      }));
    default:
      return {};
  }
}

export async function getSettingsSectionState(sectionInput: string) {
  const section = settingsSectionIdSchema.parse(sectionInput);
  if (section === "storage") {
    return storageDiagnostics();
  }
  if (section === "backups") {
    return backupDiagnostics();
  }
  if (section === "crons") {
    return cronDiagnostics();
  }
  if (section === "webhooks") {
    return webhooksDiagnostics();
  }

  const state = await readSettingsSection(section);
  return {
    ...state,
    diagnostics: await genericDiagnostics(section),
  } satisfies SettingsSectionState;
}

export async function saveSettingsSectionState<TSection extends SettingsSectionId>(
  sectionInput: TSection,
  value: SettingsSectionConfigMap[TSection],
  actorUserId?: string | null,
) {
  const section = settingsSectionIdSchema.parse(sectionInput) as TSection;
  await writeSettingsSection(section, value, actorUserId);
  if (section === "general" || section === "authentication" || section === "email" || section === "domainsOrigins") {
    await invalidateAuth();
  }
  return getSettingsSectionState(section);
}

export async function createCronJobFromInput(input: CronJobInput, actorUserId?: string | null) {
  return createCronJob(input, actorUserId);
}

export async function updateCronJobFromInput(jobId: string, input: Partial<CronJobInput>, actorUserId?: string | null) {
  return updateCronJob(jobId, input, actorUserId);
}

export async function removeCronJob(jobId: string, actorUserId?: string | null) {
  await deleteCronJob(jobId, actorUserId);
}

export async function triggerCronJob(jobId: string, actorUserId?: string | null) {
  return runCronJob(jobId, actorUserId, "manual");
}
