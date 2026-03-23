import { createAuthendClient } from '@authend/sdk';
import type {
  AiMessageCreate,
  AiThread,
  AiThreadDetail,
  ApiPreview,
  ApiResource,
  AuditLog,
  BackupRun,
  BackupSettingsResponse,
  CronJob,
  CronJobInput,
  CronRun,
  CronSettingsResponse,
  EnvironmentEditorState,
  MigrationRecord,
  PluginCatalogItem,
  PluginConfigUpdate,
  PluginManifest,
  SchemaDraft,
  SettingsSectionConfigMap,
  SettingsSectionId,
  SettingsSectionState,
  SetupStatus,
  StorageSettingsResponse,
  TableApiConfig,
} from '@authend/shared';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:7002';

const sdkClient = createAuthendClient({ baseURL });

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const client = {
  ...sdkClient,
  system: {
    ai: {
      threads: () => request<AiThread[]>('/api/admin/ai/threads'),
      createThread: (title?: string) =>
        request<AiThread>('/api/admin/ai/threads', {
          method: 'POST',
          body: JSON.stringify(title ? { title } : {}),
        }),
      thread: (threadId: string) => request<AiThreadDetail>(`/api/admin/ai/threads/${threadId}`),
      sendMessage: (threadId: string, payload: AiMessageCreate) =>
        request<AiThreadDetail>(`/api/admin/ai/threads/${threadId}/messages`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      approveRun: (runId: string) =>
        request<AiThreadDetail>(`/api/admin/ai/runs/${runId}/approve`, {
          method: 'POST',
        }),
      rejectRun: (runId: string) =>
        request<AiThreadDetail>(`/api/admin/ai/runs/${runId}/reject`, {
          method: 'POST',
        }),
    },
    setupStatus: () => request<SetupStatus>('/api/setup/status'),
    auditLogs: () => request<AuditLog[]>('/api/admin/audit'),
    migrations: () => request<MigrationRecord[]>('/api/admin/migrations'),
    previewMigrations: () => request<MigrationRecord[]>('/api/admin/migrations/preview', { method: 'POST' }),
    applyMigrations: () => request<{ applied: string[] }>('/api/admin/migrations/apply', { method: 'POST' }),
    plugins: {
      list: () => request<PluginCatalogItem[]>('/api/admin/plugins'),
      manifests: () => request<PluginManifest[]>('/api/admin/plugins/manifests'),
      manifest: (pluginId: string) => request<PluginManifest>(`/api/admin/plugins/${pluginId}/manifest`),
      saveConfig: (pluginId: string, payload: PluginConfigUpdate) =>
        request<PluginManifest>(`/api/admin/plugins/${pluginId}/config`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      enable: (pluginId: string) =>
        request<PluginManifest>(`/api/admin/plugins/${pluginId}/enable`, {
          method: 'POST',
        }),
      disable: (pluginId: string) =>
        request<PluginManifest>(`/api/admin/plugins/${pluginId}/disable`, {
          method: 'POST',
        }),
    },
    schema: {
      get: () => request<SchemaDraft>('/api/admin/schema'),
      preview: (draft: SchemaDraft) =>
        request<{ sql: string[]; warnings: string[] }>('/api/admin/schema/preview', {
          method: 'POST',
          body: JSON.stringify(draft),
        }),
      apply: (draft: SchemaDraft) =>
        request<{ migrationId: string; sql: string[] }>('/api/admin/schema/apply', {
          method: 'POST',
          body: JSON.stringify(draft),
        }),
    },
    api: {
      list: () => request<ApiResource[]>('/api/admin/api-preview'),
      preview: (table: string) => request<ApiPreview>(`/api/admin/api-preview/${table}`),
      saveConfig: (table: string, config: TableApiConfig) =>
        request<ApiPreview>(`/api/admin/api-preview/${table}`, {
          method: 'POST',
          body: JSON.stringify(config),
        }),
    },
    settings: {
      get: <TSection extends SettingsSectionId>(section: TSection) =>
        request<SettingsSectionState | StorageSettingsResponse | BackupSettingsResponse | CronSettingsResponse>(
          `/api/admin/settings/${section}`,
        ),
      save: <TSection extends SettingsSectionId>(section: TSection, config: SettingsSectionConfigMap[TSection]) =>
        request<SettingsSectionState | StorageSettingsResponse | BackupSettingsResponse | CronSettingsResponse>(
          `/api/admin/settings/${section}`,
          {
            method: 'POST',
            body: JSON.stringify(config),
          },
        ),
      env: () => request<EnvironmentEditorState>('/api/admin/settings/environments-secrets/env'),
      saveEnvRaw: (raw: string) =>
        request<EnvironmentEditorState>('/api/admin/settings/environments-secrets/env', {
          method: 'POST',
          body: JSON.stringify({ raw }),
        }),
      runBackup: () =>
        request<BackupRun>('/api/admin/settings/backups/run', {
          method: 'POST',
        }),
      cronJobs: () => request<CronJob[]>('/api/admin/settings/crons/jobs'),
      createCronJob: (payload: CronJobInput) =>
        request<CronJob>('/api/admin/settings/crons/jobs', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      updateCronJob: (jobId: string, payload: Partial<CronJobInput>) =>
        request<CronJob>(`/api/admin/settings/crons/jobs/${jobId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      deleteCronJob: (jobId: string) =>
        request<void>(`/api/admin/settings/crons/jobs/${jobId}`, {
          method: 'DELETE',
        }),
      cronRuns: () => request<CronRun[]>('/api/admin/settings/crons/runs'),
      runCronJob: (jobId: string) =>
        request<CronRun>(`/api/admin/settings/crons/${jobId}/run`, {
          method: 'POST',
        }),
    },
  },
};
