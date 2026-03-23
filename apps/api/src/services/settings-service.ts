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
} from "@authend/shared";
import { settingsSectionIdSchema } from "@authend/shared";
import { env } from "../config/env";
import { listBackupRuns } from "./backup-service";
import { createCronJob, deleteCronJob, listCronDiagnostics, listCronJobs, listCronRuns, runCronJob, updateCronJob } from "./cron-service";
import { listPluginCapabilityManifests, readPluginCapabilityManifest } from "./plugin-service";
import { invalidateAuth } from "./auth-service";
import { readSettingsSection, writeSettingsSection } from "./settings-store";
import { writeAuditLog } from "./audit-service";

const CORE_ENV_KEYS = ["APP_URL", "DATABASE_URL", "BETTER_AUTH_SECRET", "SUPERADMIN_EMAIL", "SUPERADMIN_PASSWORD"];
const ENV_FILE_PATH = resolve(process.cwd(), ".env");

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

async function storageDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("storage");
  const diagnostics: Record<string, unknown> = {
    driver: config.driver,
  };

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

    diagnostics.absoluteRoot = absoluteRoot;
    diagnostics.writable = writable;
    diagnostics.error = error;
  } else {
    diagnostics.bucket = config.bucket;
    diagnostics.region = config.region;
    diagnostics.endpoint = config.endpoint || null;
    diagnostics.credentialsConfigured = Boolean(config.accessKeyId && config.secretAccessKey);
    diagnostics.bucketConfigured = Boolean(config.bucket);
  }

  return {
    section: "storage" as const,
    config,
    updatedAt,
    diagnostics,
  } satisfies StorageSettingsResponse;
}

async function backupDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("backups");
  const runs = await listBackupRuns(15);

  const commandAvailable = (command: string) => {
    try {
      return Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "pipe" }).success;
    } catch {
      return false;
    }
  };

  return {
    section: "backups" as const,
    config,
    updatedAt,
    runs,
    diagnostics: {
      absoluteDirectoryPath: resolve(process.cwd(), config.directoryPath),
      pgDumpAvailable: commandAvailable(config.pgDumpPath),
      pgRestoreAvailable: commandAvailable(config.pgRestorePath),
      lastRunStatus: runs[0]?.status ?? null,
    },
  } satisfies BackupSettingsResponse;
}

async function cronDiagnostics() {
  const { config, updatedAt } = await readSettingsSection("crons");
  const jobs = await listCronJobs();
  const runs = await listCronRuns(25);
  const diagnostics = await listCronDiagnostics();

  return {
    section: "crons" as const,
    config,
    updatedAt,
    jobs,
    runs,
    diagnostics,
  } satisfies CronSettingsResponse;
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
      return {
        smtpConfigured: Boolean(
          (state.config.smtpHost || env.SMTP_HOST) &&
            (state.config.smtpUsername || env.SMTP_USER) &&
            (state.config.smtpPassword || env.SMTP_PASS),
        ),
        smtpHost: state.config.smtpHost || env.SMTP_HOST || null,
        sender: `${state.config.senderName} <${state.config.senderEmail}>`,
      };
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
      return {
        openApiEnabled: state.config.enableOpenApi,
        defaultAuthMode: state.config.defaultAuthMode,
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
