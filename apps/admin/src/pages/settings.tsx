import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BackupSettings,
  BackupSettingsResponse,
  CronJob,
  CronJobInput,
  CronSettingsResponse,
  SettingsSectionConfigMap,
  SettingsSectionId,
  SettingsSectionState,
  StorageSettings,
  StorageSettingsResponse,
} from "@authend/shared";
import { client } from "../lib/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { SidePanel } from "../components/ui/side-panel";
import { getErrorMessage, useFeedback } from "../components/ui/feedback";

type SettingsNavItem = {
  id: string;
  to: string;
  label: string;
  section?: SettingsSectionId;
};

type SettingsField = {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "list" | "url" | "select" | "password";
  helpText?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export const settingsNavItems: SettingsNavItem[] = [
  { id: "general", to: "/general", label: "General", section: "general" },
  { id: "authentication", to: "/authentication", label: "Authentication", section: "authentication" },
  { id: "sessions-security", to: "/sessions-security", label: "Sessions & Security", section: "sessionsSecurity" },
  { id: "email", to: "/email", label: "Email", section: "email" },
  { id: "domains-origins", to: "/domains-origins", label: "Domains & Origins", section: "domainsOrigins" },
  { id: "api", to: "/api-settings", label: "API", section: "api" },
  { id: "storage", to: "/storage", label: "File Storage", section: "storage" },
  { id: "backups", to: "/backups", label: "Backups", section: "backups" },
  { id: "crons", to: "/crons", label: "Crons", section: "crons" },
  { id: "admin-access", to: "/admin-access", label: "Admin Access", section: "adminAccess" },
  { id: "environments-secrets", to: "/environments-secrets", label: "Environments & Secrets", section: "environmentsSecrets" },
  { id: "observability", to: "/observability", label: "Observability", section: "observability" },
  { id: "danger-zone", to: "/danger-zone", label: "Danger Zone", section: "dangerZone" },
  { id: "migrations", to: "/migrations", label: "Migrations" },
];

function parseListInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatListValue(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </section>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-background">
      {title || description ? (
        <div className="border-b border-border/60 px-4 py-3">
          {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function SettingsDiagnostics({ diagnostics }: { diagnostics: Record<string, unknown> }) {
  const entries = Object.entries(diagnostics ?? {});
  if (entries.length === 0) {
    return null;
  }

  return (
    <Panel title="Diagnostics" description="Live runtime checks and derived state for this section.">
      <div className="divide-y divide-border/50">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 px-4 py-3 md:grid-cols-[220px_1fr] md:items-start md:gap-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key}</span>
            <span className="text-sm text-foreground break-words">{renderValue(value)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SettingsFieldInput({
  field,
  value,
  onChange,
}: {
  field: SettingsField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[220px_1fr] md:items-center md:gap-4">
        <div>
          <Label className="text-sm font-medium">{field.label}</Label>
          {field.helpText ? <p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p> : null}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{Boolean(value) ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-3 px-4 py-3 md:grid-cols-[220px_1fr] md:items-start md:gap-4">
      <div>
        <Label className="text-sm font-medium">{field.label}</Label>
        {field.helpText ? <p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p> : null}
      </div>
      <div>
        {field.kind === "select" ? (
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.kind === "list" ? (
          <Textarea
            className="min-h-[88px] resize-y"
            placeholder={field.placeholder}
            value={formatListValue(value)}
            onChange={(event) => onChange(parseListInput(event.target.value))}
          />
        ) : (
          <Input
            type={field.kind === "number" ? "number" : field.kind === "url" ? "url" : field.kind === "password" ? "password" : "text"}
            placeholder={field.placeholder}
            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (field.kind === "number") {
                if (field.allowEmpty && nextValue.trim() === "") {
                  onChange(null);
                  return;
                }
                const nextNumber = Number(nextValue);
                onChange(Number.isFinite(nextNumber) ? nextNumber : 0);
                return;
              }
              if (field.allowEmpty && nextValue.trim() === "") {
                onChange(null);
                return;
              }
              onChange(nextValue);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SettingsFieldsPanel({
  fields,
  draft,
  setDraft,
}: {
  fields: SettingsField[];
  draft: Record<string, unknown>;
  setDraft: (next: Record<string, unknown>) => void;
}) {
  return (
    <Panel>
      <div className="divide-y divide-border/50">
        {fields.map((field) => (
          <SettingsFieldInput
            key={field.key}
            field={field}
            value={draft[field.key]}
            onChange={(value) =>
              setDraft({
                ...draft,
                [field.key]: value,
              })
            }
          />
        ))}
      </div>
    </Panel>
  );
}

function createSettingsSectionPage<TSection extends Exclude<SettingsSectionId, "backups" | "crons" | "storage">>(
  section: TSection,
  title: string,
  description: string,
  fields: SettingsField[],
) {
  return function SettingsSectionPage() {
    const queryClient = useQueryClient();
    const { showNotice } = useFeedback();
    const { data } = useQuery({
      queryKey: ["settings", section],
      queryFn: () => client.system.settings.get(section),
    });
    const [draft, setDraft] = useState<SettingsSectionConfigMap[TSection] | null>(null);

    useEffect(() => {
      if (data && "config" in data) {
        setDraft(data.config as SettingsSectionConfigMap[TSection]);
      }
    }, [data]);

    const saveMutation = useMutation({
      mutationFn: (payload: SettingsSectionConfigMap[TSection]) => client.system.settings.save(section, payload),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["settings", section] });
        showNotice({
          title: "Settings saved",
          description: `${title} settings were updated.`,
          variant: "success",
          durationMs: 4000,
        });
      },
      onError: (error) =>
        showNotice({
          title: "Failed to save settings",
          description: getErrorMessage(error, `Could not save ${title.toLowerCase()} settings.`),
          variant: "destructive",
          durationMs: 6000,
        }),
    });

    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={title}
          description={description}
          actions={
            <Button onClick={() => draft && saveMutation.mutate(draft)} disabled={!draft || saveMutation.isPending}>
              Save changes
            </Button>
          }
        />

        {draft ? (
          <SettingsFieldsPanel
            fields={fields}
            draft={draft as Record<string, unknown>}
            setDraft={(next) => setDraft(next as SettingsSectionConfigMap[TSection])}
          />
        ) : null}

        <SettingsDiagnostics diagnostics={(data as SettingsSectionState | undefined)?.diagnostics ?? {}} />
      </div>
    );
  };
}

const generalFields: SettingsField[] = [
  { key: "projectLabel", label: "Project label", kind: "text" },
  { key: "appName", label: "App name", kind: "text" },
  { key: "appUrl", label: "App URL", kind: "url" },
  { key: "adminUrl", label: "Admin URL", kind: "url" },
  { key: "timezone", label: "Timezone", kind: "text" },
  { key: "locale", label: "Locale", kind: "text" },
];

const authenticationFields: SettingsField[] = [
  { key: "allowSignUp", label: "Allow sign-up", kind: "boolean", helpText: "Controls whether new email/password users can create accounts." },
  { key: "requireEmailVerification", label: "Require email verification", kind: "boolean" },
  { key: "minPasswordLength", label: "Minimum password length", kind: "number" },
  { key: "maxPasswordLength", label: "Maximum password length", kind: "number" },
];

const sessionsFields: SettingsField[] = [
  { key: "sessionTtlSeconds", label: "Session TTL (seconds)", kind: "number" },
  { key: "rememberMeTtlSeconds", label: "Remember-me TTL (seconds)", kind: "number" },
  { key: "allowMultipleSessions", label: "Allow multiple sessions", kind: "boolean" },
  { key: "maxSessionsPerUser", label: "Max sessions per user", kind: "number" },
  { key: "enforceTwoFactorForAdmins", label: "Enforce 2FA for admins", kind: "boolean" },
  { key: "magicLinkTtlSeconds", label: "Magic-link TTL (seconds)", kind: "number" },
  { key: "apiKeyDefaultTtlDays", label: "Default API key TTL (days)", kind: "number" },
  { key: "lockoutThreshold", label: "Lockout threshold", kind: "number" },
  { key: "lockoutWindowMinutes", label: "Lockout window (minutes)", kind: "number" },
];

const emailFields: SettingsField[] = [
  { key: "smtpHost", label: "SMTP host", kind: "text" },
  { key: "smtpPort", label: "SMTP port", kind: "number" },
  { key: "smtpUsername", label: "SMTP username", kind: "text" },
  { key: "smtpPassword", label: "SMTP password", kind: "password" },
  { key: "smtpSecure", label: "Use secure SMTP", kind: "boolean", helpText: "Enable TLS from connect time. Usually needed for port 465." },
  { key: "senderName", label: "Sender name", kind: "text" },
  { key: "senderEmail", label: "Sender email", kind: "text" },
  { key: "replyToEmail", label: "Reply-to email", kind: "text", allowEmpty: true },
  { key: "passwordResetSubject", label: "Password reset subject", kind: "text" },
  { key: "verificationSubject", label: "Verification subject", kind: "text" },
  { key: "testRecipient", label: "Test recipient", kind: "text", allowEmpty: true },
];

const domainsFields: SettingsField[] = [
  { key: "trustedOrigins", label: "Trusted origins", kind: "list" },
  { key: "corsOrigins", label: "CORS origins", kind: "list" },
  { key: "redirectOrigins", label: "Redirect origins", kind: "list" },
  { key: "cookieDomain", label: "Cookie domain", kind: "text", allowEmpty: true },
  { key: "secureCookies", label: "Secure cookies", kind: "boolean" },
];

const apiFields: SettingsField[] = [
  { key: "defaultPageSize", label: "Default page size", kind: "number" },
  { key: "maxPageSize", label: "Max page size", kind: "number" },
  { key: "defaultRateLimitPerMinute", label: "Default rate limit/min", kind: "number" },
  { key: "maxRateLimitPerMinute", label: "Max rate limit/min", kind: "number" },
  {
    key: "defaultAuthMode",
    label: "Default auth mode",
    kind: "select",
    options: [
      { value: "superadmin", label: "Superadmin" },
      { value: "session", label: "Session" },
      { value: "public", label: "Public" },
    ],
  },
  { key: "enableOpenApi", label: "Enable OpenAPI", kind: "boolean" },
  { key: "allowClientApiPreview", label: "Allow client API preview", kind: "boolean" },
];

const adminAccessFields: SettingsField[] = [
  { key: "defaultRole", label: "Default role", kind: "text" },
  { key: "adminRoles", label: "Admin roles", kind: "list" },
  { key: "allowImpersonatingAdmins", label: "Allow impersonating admins", kind: "boolean" },
  { key: "requireBanReason", label: "Require ban reason", kind: "boolean" },
  { key: "protectAdminPlugin", label: "Protect admin plugin", kind: "boolean" },
];

const envFields: SettingsField[] = [
  { key: "additionalRequiredEnvKeys", label: "Additional required env keys", kind: "list" },
  { key: "sensitivePrefixes", label: "Sensitive prefixes", kind: "list" },
  { key: "showMissingSecretsOnDashboard", label: "Show missing secrets on dashboard", kind: "boolean" },
];

const observabilityFields: SettingsField[] = [
  {
    key: "logLevel",
    label: "Log level",
    kind: "select",
    options: [
      { value: "info", label: "Info" },
      { value: "warn", label: "Warn" },
      { value: "error", label: "Error" },
    ],
  },
  { key: "auditRetentionDays", label: "Audit retention (days)", kind: "number" },
  { key: "healthcheckVerbose", label: "Verbose health checks", kind: "boolean" },
  { key: "enableRequestLogging", label: "Enable request logging", kind: "boolean" },
  { key: "enableMetrics", label: "Enable metrics", kind: "boolean" },
];

const dangerZoneFields: SettingsField[] = [
  { key: "maintenanceMode", label: "Maintenance mode", kind: "boolean" },
  { key: "disablePublicSignup", label: "Disable public signup", kind: "boolean" },
  { key: "allowDestructiveSchemaChanges", label: "Allow destructive schema changes", kind: "boolean" },
  { key: "enableDemoReset", label: "Enable demo reset", kind: "boolean" },
];

export const GeneralSettingsPage = createSettingsSectionPage(
  "general",
  "General",
  "Project identity, URLs, locale, and timezone defaults.",
  generalFields,
);

export const AuthenticationSettingsPage = createSettingsSectionPage(
  "authentication",
  "Authentication",
  "Core email/password auth policy. Social sign-on stays in Plugins.",
  authenticationFields,
);

export const SessionsSecuritySettingsPage = createSettingsSectionPage(
  "sessionsSecurity",
  "Sessions & Security",
  "Session lifetime, 2FA posture, magic-link defaults, API key lifetime, and lockout policy.",
  sessionsFields,
);

export const EmailSettingsPage = createSettingsSectionPage(
  "email",
  "Email",
  "SMTP transport and auth email copy used by password reset, verification, and plugin mail flows.",
  emailFields,
);

export const DomainsOriginsSettingsPage = createSettingsSectionPage(
  "domainsOrigins",
  "Domains & Origins",
  "Trusted origins, CORS settings, redirect origins, and cookie domain policy.",
  domainsFields,
);

export const ApiSettingsPage = createSettingsSectionPage(
  "api",
  "API",
  "Defaults for pagination, rate limiting, OpenAPI exposure, and client-facing API behavior.",
  apiFields,
);

export const AdminAccessSettingsPage = createSettingsSectionPage(
  "adminAccess",
  "Admin Access",
  "Default roles, admin role policy, impersonation policy, and admin plugin protection.",
  adminAccessFields,
);

export const EnvironmentsSecretsSettingsPage = createSettingsSectionPage(
  "environmentsSecrets",
  "Environments & Secrets",
  "Required environment keys, secret prefix conventions, and missing secret diagnostics.",
  envFields,
);

export const ObservabilitySettingsPage = createSettingsSectionPage(
  "observability",
  "Observability",
  "Log level, audit retention, request logging, metrics, and health-check verbosity.",
  observabilityFields,
);

export const DangerZoneSettingsPage = createSettingsSectionPage(
  "dangerZone",
  "Danger Zone",
  "High-impact safety toggles such as maintenance mode, public signup shutdown, and destructive schema controls.",
  dangerZoneFields,
);

const storageSharedFields: SettingsField[] = [
  { key: "publicBaseUrl", label: "Public base URL", kind: "url", allowEmpty: true },
  { key: "maxUploadBytes", label: "Max upload bytes", kind: "number" },
  { key: "allowedMimeTypes", label: "Allowed mime types", kind: "list" },
  { key: "signedUrlTtlSeconds", label: "Signed URL TTL (seconds)", kind: "number" },
  { key: "retentionDays", label: "Retention days", kind: "number", allowEmpty: true },
  {
    key: "defaultVisibility",
    label: "Default visibility",
    kind: "select",
    options: [
      { value: "private", label: "Private" },
      { value: "public", label: "Public" },
    ],
  },
];

export function StorageSettingsPage() {
  const queryClient = useQueryClient();
  const { showNotice } = useFeedback();
  const { data } = useQuery({
    queryKey: ["settings", "storage"],
    queryFn: () => client.system.settings.get("storage"),
  });
  const [draft, setDraft] = useState<StorageSettings | null>(null);

  useEffect(() => {
    if (data && "config" in data) {
      setDraft((data as StorageSettingsResponse).config);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: StorageSettings) => client.system.settings.save("storage", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "storage"] });
      showNotice({
        title: "Storage settings saved",
        description: "Storage configuration was updated.",
        variant: "success",
        durationMs: 4000,
      });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to save storage settings",
        description: getErrorMessage(error, "Could not save file storage settings."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const response = data as StorageSettingsResponse | undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="File Storage"
        description="Choose a local Bun-backed filesystem or an S3-compatible object store. Upload/browser UI can build on this later."
        actions={
          <Button onClick={() => draft && saveMutation.mutate(draft)} disabled={!draft || saveMutation.isPending}>
            Save changes
          </Button>
        }
      />

      {draft ? (
        <>
          <Panel title="Driver" description="Select the storage backend used by the project.">
            <div className="divide-y divide-border/50">
              <SettingsFieldInput
                field={{
                  key: "driver",
                  label: "Driver",
                  kind: "select",
                  options: [
                    { value: "local", label: "Local filesystem" },
                    { value: "s3", label: "S3 compatible" },
                  ],
                }}
                value={draft.driver}
                onChange={(value) => setDraft({ ...draft, driver: value as StorageSettings["driver"] })}
              />
            </div>
          </Panel>

          {draft.driver === "local" ? (
            <SettingsFieldsPanel
              fields={[{ key: "rootPath", label: "Root path", kind: "text" }]}
              draft={draft as unknown as Record<string, unknown>}
              setDraft={(next) => setDraft(next as unknown as StorageSettings)}
            />
          ) : (
            <SettingsFieldsPanel
              fields={[
                { key: "bucket", label: "Bucket", kind: "text" },
                { key: "region", label: "Region", kind: "text" },
                { key: "endpoint", label: "Endpoint", kind: "text", allowEmpty: true, helpText: "Optional custom endpoint for MinIO, Cloudflare R2, DigitalOcean Spaces, and similar providers." },
                { key: "accessKeyId", label: "Access key ID", kind: "text" },
                { key: "secretAccessKey", label: "Secret access key", kind: "password" },
                { key: "forcePathStyle", label: "Force path-style requests", kind: "boolean" },
              ]}
              draft={draft as unknown as Record<string, unknown>}
              setDraft={(next) => setDraft(next as unknown as StorageSettings)}
            />
          )}

          <SettingsFieldsPanel
            fields={storageSharedFields}
            draft={draft as unknown as Record<string, unknown>}
            setDraft={(next) => setDraft(next as unknown as StorageSettings)}
          />
        </>
      ) : null}

      <SettingsDiagnostics diagnostics={response?.diagnostics ?? {}} />
    </div>
  );
}

export function BackupsSettingsPage() {
  const queryClient = useQueryClient();
  const { showNotice } = useFeedback();
  const { data } = useQuery({
    queryKey: ["settings", "backups"],
    queryFn: () => client.system.settings.get("backups"),
  });
  const [draft, setDraft] = useState<BackupSettings | null>(null);

  useEffect(() => {
    if (data && "config" in data) {
      setDraft((data as BackupSettingsResponse).config);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: BackupSettings) => client.system.settings.save("backups", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "backups"] });
      showNotice({ title: "Backup settings saved", description: "Backup configuration was updated.", variant: "success", durationMs: 4000 });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to save backup settings",
        description: getErrorMessage(error, "Could not save backup settings."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const runBackupMutation = useMutation({
    mutationFn: () => client.system.settings.runBackup(),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "backups"] });
      showNotice({
        title: run.status === "succeeded" ? "Backup completed" : "Backup failed",
        description: run.status === "succeeded" ? `Archive saved to ${run.filePath ?? run.destination}` : run.error ?? "Backup failed.",
        variant: run.status === "succeeded" ? "success" : "destructive",
        durationMs: 6000,
      });
    },
    onError: (error) =>
      showNotice({
        title: "Backup failed to start",
        description: getErrorMessage(error, "Could not trigger a backup run."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const response = data as BackupSettingsResponse | undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Backups"
        description="Postgres backups through pg_dump, local archive retention, and recent run history."
        actions={
          <>
            <Button variant="outline" onClick={() => runBackupMutation.mutate()} disabled={runBackupMutation.isPending}>
              Run backup now
            </Button>
            <Button onClick={() => draft && saveMutation.mutate(draft)} disabled={!draft || saveMutation.isPending}>
              Save changes
            </Button>
          </>
        }
      />

      {draft ? (
        <SettingsFieldsPanel
          fields={[
            { key: "enabled", label: "Enable backups", kind: "boolean" },
            { key: "directoryPath", label: "Backup directory", kind: "text" },
            { key: "retentionDays", label: "Retention days", kind: "number" },
            { key: "pgDumpPath", label: "pg_dump path", kind: "text" },
            { key: "pgRestorePath", label: "pg_restore path", kind: "text" },
            {
              key: "format",
              label: "Backup format",
              kind: "select",
              options: [
                { value: "plain", label: "Plain SQL" },
                { value: "custom", label: "Custom archive" },
              ],
            },
            { key: "verifyOnCreate", label: "Verify after create", kind: "boolean" },
          ]}
          draft={draft as unknown as Record<string, unknown>}
          setDraft={(next) => setDraft(next as unknown as BackupSettings)}
        />
      ) : null}

      <SettingsDiagnostics diagnostics={response?.diagnostics ?? {}} />

      <Panel title="Recent runs">
        {(response?.runs ?? []).length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No backup runs recorded yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {(response?.runs ?? []).map((run) => (
              <div key={run.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[auto_1fr_auto] md:items-start md:gap-4">
                <Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                  {run.status}
                </Badge>
                <div>
                  <p className="font-medium text-foreground">{run.filePath ?? run.destination}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.trigger} • {run.startedAt}
                  </p>
                  {run.error ? <p className="mt-1 text-xs text-destructive">{run.error}</p> : null}
                </div>
                <div className="text-sm text-muted-foreground">{run.sizeBytes !== null ? `${run.sizeBytes.toLocaleString()} bytes` : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

const defaultCronDraft: CronJobInput = {
  name: "",
  description: "",
  handler: "backup.run",
  schedule: "0 * * * *",
  enabled: true,
  timeoutSeconds: 120,
  concurrencyPolicy: "skip",
  config: {},
};

export function CronsSettingsPage() {
  const queryClient = useQueryClient();
  const { showNotice, confirm } = useFeedback();
  const { data } = useQuery({
    queryKey: ["settings", "crons"],
    queryFn: () => client.system.settings.get("crons"),
  });
  const [draft, setDraft] = useState<CronSettingsResponse["config"] | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [jobDraft, setJobDraft] = useState<CronJobInput>(defaultCronDraft);
  const [jobConfigJson, setJobConfigJson] = useState("{}");

  useEffect(() => {
    if (data && "config" in data) {
      setDraft((data as CronSettingsResponse).config);
    }
  }, [data]);

  const openCreateJob = () => {
    setEditingJob(null);
    setJobDraft(defaultCronDraft);
    setJobConfigJson("{}");
    setPanelOpen(true);
  };

  const openEditJob = (job: CronJob) => {
    setEditingJob(job);
    setJobDraft({
      name: job.name,
      description: job.description ?? "",
      handler: job.handler,
      schedule: job.schedule,
      enabled: job.enabled,
      timeoutSeconds: job.timeoutSeconds,
      concurrencyPolicy: job.concurrencyPolicy,
      config: job.config,
    });
    setJobConfigJson(JSON.stringify(job.config ?? {}, null, 2));
    setPanelOpen(true);
  };

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: CronSettingsResponse["config"]) => client.system.settings.save("crons", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "crons"] });
      showNotice({ title: "Cron settings saved", description: "Scheduler defaults were updated.", variant: "success", durationMs: 4000 });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to save cron settings",
        description: getErrorMessage(error, "Could not save scheduler settings."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const saveJobMutation = useMutation({
    mutationFn: (payload: { id?: string; input: CronJobInput }) =>
      payload.id ? client.system.settings.updateCronJob(payload.id, payload.input) : client.system.settings.createCronJob(payload.input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "crons"] });
      setPanelOpen(false);
      showNotice({ title: "Cron job saved", description: "The job definition was updated.", variant: "success", durationMs: 4000 });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to save cron job",
        description: getErrorMessage(error, "Could not save the cron job."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const runJobMutation = useMutation({
    mutationFn: (jobId: string) => client.system.settings.runCronJob(jobId),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "crons"] });
      showNotice({
        title: run.status === "succeeded" ? "Cron run completed" : run.status === "skipped" ? "Cron run skipped" : "Cron run failed",
        description: run.error ?? `${run.jobName} finished with status ${run.status}.`,
        variant: run.status === "succeeded" ? "success" : run.status === "skipped" ? "default" : "destructive",
        durationMs: 5000,
      });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to run cron job",
        description: getErrorMessage(error, "Could not trigger the cron job."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => client.system.settings.deleteCronJob(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "crons"] });
      showNotice({ title: "Cron job deleted", description: "The job was removed.", variant: "success", durationMs: 4000 });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to delete cron job",
        description: getErrorMessage(error, "Could not delete the cron job."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const response = data as CronSettingsResponse | undefined;

  const saveJob = () => {
    try {
      const parsedConfig = JSON.parse(jobConfigJson) as Record<string, unknown>;
      saveJobMutation.mutate({
        id: editingJob?.id,
        input: {
          ...jobDraft,
          config: parsedConfig,
        },
      });
    } catch {
      showNotice({
        title: "Invalid job config JSON",
        description: "Fix the JSON configuration before saving the cron job.",
        variant: "destructive",
        durationMs: 6000,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Crons"
        description="In-process Bun scheduler with Postgres-backed job definitions, run history, and manual execution."
        actions={
          <>
            <Button variant="outline" onClick={openCreateJob}>
              New cron job
            </Button>
            <Button onClick={() => draft && saveSettingsMutation.mutate(draft)} disabled={!draft || saveSettingsMutation.isPending}>
              Save scheduler
            </Button>
          </>
        }
      />

      {draft ? (
        <SettingsFieldsPanel
          fields={[
            { key: "schedulerEnabled", label: "Scheduler enabled", kind: "boolean" },
            { key: "tickSeconds", label: "Tick seconds", kind: "number" },
            { key: "defaultTimeoutSeconds", label: "Default timeout seconds", kind: "number" },
            { key: "maxConcurrentRuns", label: "Max concurrent runs", kind: "number" },
          ]}
          draft={draft as unknown as Record<string, unknown>}
          setDraft={(next) => setDraft(next as unknown as CronSettingsResponse["config"])}
        />
      ) : null}

      <SettingsDiagnostics diagnostics={response?.diagnostics ?? {}} />

      <Panel title="Jobs">
        {(response?.jobs ?? []).length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No cron jobs configured yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {(response?.jobs ?? []).map((job) => (
              <div key={job.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1.3fr_1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{job.name}</p>
                    <Badge variant={job.enabled ? "default" : "secondary"}>{job.enabled ? "enabled" : "disabled"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.handler} • {job.schedule}
                  </p>
                  {job.description ? <p className="mt-1 text-sm text-muted-foreground">{job.description}</p> : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>
                    Next run: <span className="text-foreground">{job.nextRunAt ?? "—"}</span>
                  </p>
                  <p>
                    Last run: <span className="text-foreground">{job.lastRunAt ?? "—"}</span>
                  </p>
                </div>
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Button variant="outline" size="sm" onClick={() => runJobMutation.mutate(job.id)} disabled={runJobMutation.isPending}>
                    Run now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditJob(job)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: `Delete ${job.name}?`,
                        description: "This removes the cron job definition and future scheduled runs.",
                        confirmLabel: "Delete job",
                        cancelLabel: "Keep job",
                        variant: "destructive",
                      });
                      if (confirmed) {
                        deleteJobMutation.mutate(job.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Recent runs">
        {(response?.runs ?? []).length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No cron runs recorded yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {(response?.runs ?? []).map((run) => (
              <div key={run.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-start md:gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{run.jobName}</p>
                    <Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                      {run.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.trigger} • {run.startedAt}
                  </p>
                  {run.error ? <p className="mt-1 text-xs text-destructive">{run.error}</p> : null}
                </div>
                <div className="text-sm text-muted-foreground">{run.durationMs !== null ? `${run.durationMs}ms` : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <SidePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editingJob ? "Edit Cron Job" : "New Cron Job"}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPanelOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveJob} disabled={saveJobMutation.isPending}>
              Save job
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <SettingsFieldInput field={{ key: "name", label: "Name", kind: "text" }} value={jobDraft.name} onChange={(value) => setJobDraft({ ...jobDraft, name: String(value) })} />
          <SettingsFieldInput field={{ key: "description", label: "Description", kind: "text", allowEmpty: true }} value={jobDraft.description ?? ""} onChange={(value) => setJobDraft({ ...jobDraft, description: (value as string | null) ?? "" })} />
          <SettingsFieldInput
            field={{
              key: "handler",
              label: "Handler",
              kind: "select",
              options: [
                { value: "backup.run", label: "Backup run" },
                { value: "audit.prune", label: "Audit prune" },
                { value: "sessions.pruneExpired", label: "Sessions prune expired" },
                { value: "storage.cleanup", label: "Storage cleanup" },
              ],
            }}
            value={jobDraft.handler}
            onChange={(value) => setJobDraft({ ...jobDraft, handler: value as CronJobInput["handler"] })}
          />
          <SettingsFieldInput
            field={{ key: "schedule", label: "Schedule", kind: "text", helpText: "Five-field cron syntax: minute hour day month weekday" }}
            value={jobDraft.schedule}
            onChange={(value) => setJobDraft({ ...jobDraft, schedule: String(value) })}
          />
          <SettingsFieldInput field={{ key: "enabled", label: "Enabled", kind: "boolean" }} value={jobDraft.enabled} onChange={(value) => setJobDraft({ ...jobDraft, enabled: Boolean(value) })} />
          <SettingsFieldInput field={{ key: "timeoutSeconds", label: "Timeout seconds", kind: "number" }} value={jobDraft.timeoutSeconds} onChange={(value) => setJobDraft({ ...jobDraft, timeoutSeconds: Number(value) })} />
          <SettingsFieldInput
            field={{
              key: "concurrencyPolicy",
              label: "Concurrency policy",
              kind: "select",
              options: [
                { value: "skip", label: "Skip" },
                { value: "parallel", label: "Parallel" },
              ],
            }}
            value={jobDraft.concurrencyPolicy}
            onChange={(value) => setJobDraft({ ...jobDraft, concurrencyPolicy: value as CronJobInput["concurrencyPolicy"] })}
          />
          <div className="space-y-1">
            <Label className="text-sm font-medium">Handler config JSON</Label>
            <Textarea className="min-h-[180px] resize-y font-mono text-xs" value={jobConfigJson} onChange={(event) => setJobConfigJson(event.target.value)} />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
