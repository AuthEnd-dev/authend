import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BackupSettings,
  BackupSettingsResponse,
  CronJob,
  CronJobInput,
  CronSettingsResponse,
  EnvironmentEditorState,
  SettingsSectionConfigMap,
  SettingsSectionId,
  SettingsSectionState,
  StorageSettings,
  StorageSettingsResponse,
  Webhook,
  WebhookDelivery,
  WebhookEventType,
  WebhookInput,
  WebhooksSettingsResponse,
} from "@authend/shared";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
} from "lucide-react";
import { client } from "../lib/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { SidePanel } from "../components/ui/side-panel";
import { getErrorMessage, useFeedback } from "../components/ui/feedback";
import { TooltipComponent as Tooltip } from "../components/ui/tooltip";
import { cn } from "../lib/utils";

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
  { id: "webhooks", to: "/webhooks", label: "Webhooks", section: "webhooks" },
  { id: "ai-assistant", to: "/ai-assistant", label: "AI Assistant", section: "aiAssistant" },
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
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "—";
}

function serializeEnvValue(value: string) {
  if (value === "") {
    return "";
  }
  if (/[\s#"'\n]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function buildEnvRaw(variables: EnvironmentEditorState["variables"]) {
  return variables
    .filter((entry) => entry.name.trim().length > 0)
    .map((entry) => `${entry.name.trim()}=${serializeEnvValue(entry.value)}`)
    .join("\n");
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

function CollapsiblePanel({
  title,
  description,
  children,
  defaultCollapsed = false,
  actions,
  contentClassName,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  actions?: ReactNode;
  contentClassName?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 md:px-5">
        <button type="button" onClick={() => setCollapsed((current) => !current)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          {collapsed ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </button>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {!collapsed ? <div className={cn("p-4 md:p-5", contentClassName)}>{children}</div> : null}
    </section>
  );
}

function SettingsDiagnostics({ diagnostics }: { diagnostics: Record<string, unknown> }) {
  const entries = Object.entries(diagnostics ?? {});
  if (entries.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel title="Diagnostics" description="Live runtime checks and derived state for this section." defaultCollapsed>
      <div className="divide-y divide-border/50">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[220px_1fr] md:items-start md:gap-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key}</span>
            <span className="text-sm text-foreground wrap-break-word">{renderValue(value)}</span>
          </div>
        ))}
      </div>
    </CollapsiblePanel>
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
      <div className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[220px_1fr] md:items-center md:gap-4">
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
          <span>{value ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[220px_1fr] md:items-start md:gap-4">
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
  title = "Configuration",
  description = "Review and update this section.",
  defaultCollapsed = false,
}: {
  fields: SettingsField[];
  draft: Record<string, unknown>;
  setDraft: (next: Record<string, unknown>) => void;
  title?: string;
  description?: string;
  defaultCollapsed?: boolean;
}) {
  return (
    <CollapsiblePanel title={title} description={description} defaultCollapsed={defaultCollapsed}>
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
    </CollapsiblePanel>
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
            title={`${title} settings`}
            description={description}
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
  { key: "allowClientApiPreview", label: "Allow client API preview", kind: "boolean" },
];

const aiAssistantFields: SettingsField[] = [
  { key: "enabled", label: "Enable AI assistant", kind: "boolean" },
  {
    key: "provider",
    label: "Provider",
    kind: "select",
    options: [{ value: "openai-compatible", label: "OpenAI-compatible" }],
  },
  { key: "baseUrl", label: "Base URL", kind: "url" },
  { key: "model", label: "Model", kind: "text" },
  { key: "apiKeyEnvVar", label: "API key env var", kind: "text" },
];

const adminAccessFields: SettingsField[] = [
  { key: "defaultRole", label: "Default role", kind: "text" },
  { key: "adminRoles", label: "Admin roles", kind: "list" },
  { key: "allowImpersonatingAdmins", label: "Allow impersonating admins", kind: "boolean" },
  { key: "requireBanReason", label: "Require ban reason", kind: "boolean" },
  { key: "protectAdminPlugin", label: "Protect admin plugin", kind: "boolean" },
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
  "Defaults for pagination, rate limiting, and client-facing API behavior.",
  apiFields,
);

export const AiAssistantSettingsPage = createSettingsSectionPage(
  "aiAssistant",
  "AI Assistant",
  "Configure the OpenAI-compatible provider used by the superadmin assistant. The API key stays in your environment file.",
  aiAssistantFields,
);

export const AdminAccessSettingsPage = createSettingsSectionPage(
  "adminAccess",
  "Admin Access",
  "Default roles, admin role policy, impersonation policy, and admin plugin protection.",
  adminAccessFields,
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
  {
    key: "allowAnonymousPublicRead",
    label: "Allow anonymous public reads",
    kind: "boolean",
    helpText:
      "When enabled, GET /api/storage/public/<object-key> serves objects whose metadata is public without authentication.",
  },
  {
    key: "validateImageMagicBytes",
    label: "Validate image magic bytes",
    kind: "boolean",
    helpText: "Reject uploads when declared image/* types do not match PNG, JPEG, GIF, or WebP signatures.",
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
        description="Choose a local Bun-backed filesystem or an S3-compatible object store. The Storage Files page lists objects; public reads can be exposed without a session when allowed below."
        actions={
          <Button onClick={() => draft && saveMutation.mutate(draft)} disabled={!draft || saveMutation.isPending}>
            Save changes
          </Button>
        }
      />

      {draft ? (
        <>
          <CollapsiblePanel title="Driver" description="Select the storage backend used by the project.">
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
          </CollapsiblePanel>

          {draft.driver === "local" ? (
            <SettingsFieldsPanel
              title="Local storage"
              description="Filesystem-backed storage settings for the current project."
              fields={[{ key: "rootPath", label: "Root path", kind: "text" }]}
              draft={draft as unknown as Record<string, unknown>}
              setDraft={(next) => setDraft(next as unknown as StorageSettings)}
            />
          ) : (
            <SettingsFieldsPanel
              title="S3-compatible storage"
              description="Bucket, credentials, and endpoint settings for object storage providers."
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
            title="Shared storage policy"
            description="Visibility, upload limits, MIME rules, and signed URL defaults."
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

const webhookFields: SettingsField[] = [
  { key: "maxAttempts", label: "Max attempts", kind: "number", helpText: "Number of retries before marking an event as dead." },
  { key: "timeoutSeconds", label: "Timeout (seconds)", kind: "number", helpText: "Maximum time to wait for a webhook response." },
  { key: "retainDeliveryDays", label: "Retention (days)", kind: "number", helpText: "How long to keep delivery logs." },
];

export function WebhooksSettingsPage() {
  const queryClient = useQueryClient();
  const { showNotice, confirm } = useFeedback();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<Partial<WebhookInput>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const { data } = useQuery({
    queryKey: ["settings", "webhooks"],
    queryFn: () => client.system.settings.get("webhooks") as Promise<WebhooksSettingsResponse>,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: any) => client.system.settings.save("webhooks", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] });
      showNotice({ title: "Settings saved", variant: "success" });
    },
  });

  const upsertWebhookMutation = useMutation({
    mutationFn: (payload: WebhookInput) =>
      editingId ? client.system.webhooks.update(editingId, payload) : client.system.webhooks.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] });
      setEditorOpen(false);
      showNotice({ title: editingId ? "Webhook updated" : "Webhook created", variant: "success" });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => client.system.webhooks.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] });
      showNotice({ title: "Webhook deleted", variant: "success" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: ({ id, deliveryId }: { id: string; deliveryId: string }) => client.system.webhooks.retry(id, deliveryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] });
      showNotice({ title: "Retry scheduled", variant: "success" });
    },
  });

  const toggleWebhook = (webhook: Webhook) => {
    upsertWebhookMutation.mutate({
      url: webhook.url,
      enabled: !webhook.enabled,
      events: webhook.events,
      description: webhook.description ?? undefined,
    } as any);
  };

  const openCreate = () => {
    setEditingId(null);
    setWebhookDraft({ enabled: true, events: [] });
    setEditorOpen(true);
  };

  const openEdit = (webhook: Webhook) => {
    setEditingId(webhook.id);
    setWebhookDraft({
      url: webhook.url,
      enabled: webhook.enabled,
      description: webhook.description ?? "",
      events: webhook.events as WebhookEventType[],
    });
    setEditorOpen(true);
  };

  const confirmDelete = async (id: string) => {
    if (await confirm({ title: "Delete Webhook?", description: "This will permanently remove this endpoint and all its delivery history.", variant: "destructive" })) {
      deleteWebhookMutation.mutate(id);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Webhooks"
        description="Receive real-time notifications when events happen in your system. We deliver signed POST requests to your endpoints with exponential backoff."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add webhook
          </Button>
        }
      />

      {data ? (
        <>
          <SettingsFieldsPanel
            fields={webhookFields}
            draft={data.config as any}
            setDraft={(next) => saveSettingsMutation.mutate(next)}
          />

          <CollapsiblePanel title="Webhooks" description="Endpoints registered to receive events.">
            <div className="divide-y divide-border/50">
              {data.webhooks.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No webhooks configured yet.</div>
              ) : (
                data.webhooks.map((wh) => (
                  <div key={wh.id} className="group flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{wh.url}</span>
                        {wh.enabled ? (
                          <Badge variant="outline" className="h-5 bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="h-5">Disabled</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {wh.description && <span>{wh.description}</span>}
                        <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> {wh.events.length} events</span>
                        {wh.secret ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1" title="HMAC-SHA256 signature enabled">
                              <ShieldAlert className="h-3 w-3" /> Signed
                            </span>
                            <div className="flex items-center bg-muted/40 rounded px-1.5 py-0.5 border border-border/40 gap-1.5">
                              <code className="text-[10px] font-mono select-all">
                                {revealedSecrets[wh.id] ? wh.secret : "••••••••••••••••"}
                              </code>
                              <Tooltip content={revealedSecrets[wh.id] ? "Hide secret" : "Show secret"}>
                                <button
                                  onClick={() => setRevealedSecrets(prev => ({ ...prev, [wh.id]: !prev[wh.id] }))}
                                  className="hover:text-foreground transition-colors p-0.5"
                                >
                                  {revealedSecrets[wh.id] ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                                </button>
                              </Tooltip>
                              <Tooltip content="Copy secret">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(wh.secret);
                                    showNotice({ title: "Secret copied", variant: "success", durationMs: 2000 });
                                  }}
                                  className="hover:text-foreground transition-colors p-0.5 border-l border-border/40 pl-1.5"
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </Tooltip>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip content={wh.enabled ? "Disable webhook" : "Enable webhook"}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleWebhook(wh)}>
                          {wh.enabled ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                      </Tooltip>
                      <Tooltip content="Edit webhook">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(wh)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delete webhook">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => confirmDelete(wh.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="Recent Deliveries" description="Verification log of recent outbound requests." defaultCollapsed>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Event</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Response</th>
                    <th className="pb-2 pr-4">Attempt</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.recentDeliveries.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No recent deliveries.</td></tr>
                  ) : (
                    data.recentDeliveries.map((delivery) => (
                      <tr key={delivery.id} className="group">
                        <td className="py-3 pr-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{delivery.eventType}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground uppercase">{delivery.id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          {delivery.status === "succeeded" ? (
                            <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3" /> {delivery.httpStatus}</Badge>
                          ) : delivery.status === "failed" ? (
                            <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3" /> Retrying</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Dead</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="max-w-[200px] truncate text-xs text-muted-foreground" title={delivery.response ?? undefined}>
                            {delivery.response || (delivery.httpStatus ? `Code ${delivery.httpStatus}` : (delivery.lastError || "—"))}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {delivery.attemptCount} / {data.config.maxAttempts}
                        </td>
                        <td className="py-3 text-muted-foreground tabular-nums">
                          {new Date(delivery.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CollapsiblePanel>

          <SettingsDiagnostics diagnostics={data.diagnostics as any} />
        </>
      ) : null}

      <SidePanel
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? "Edit Webhook" : "Add Webhook"}
        footer={
          <div className="flex gap-2 p-4">
            <Button variant="outline" className="flex-1" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={() => upsertWebhookMutation.mutate(webhookDraft as WebhookInput)} disabled={!webhookDraft.url || upsertWebhookMutation.isPending}>
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Endpoint URL</Label>
            <Input
              placeholder="https://api.example.com/webhooks"
              value={webhookDraft.url || ""}
              onChange={(e) => setWebhookDraft({ ...webhookDraft, url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Must be an HTTPS address for production use.</p>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="e.g. My notification service"
              value={webhookDraft.description || ""}
              onChange={(e) => setWebhookDraft({ ...webhookDraft, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Events to subscribe to</Label>
            <div className="grid grid-cols-1 gap-2 p-3 rounded-lg border border-border bg-muted/30 max-h-[300px] overflow-y-auto">
              {[
                "data.record.created", "data.record.updated", "data.record.deleted",
                "auth.user.created", "auth.user.deleted", "auth.user.signed_in", "auth.user.signed_out", "auth.session.created", "auth.session.deleted",
                "schema.applied", "plugin.enabled", "plugin.disabled"
              ].map((eventType) => (
                <label key={eventType} className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={webhookDraft.events?.includes(eventType as any)}
                    onChange={(e) => {
                      const current = webhookDraft.events || [];
                      const next = e.target.checked
                        ? [...current, eventType]
                        : current.filter((t: any) => t !== eventType);
                      setWebhookDraft({ ...webhookDraft, events: next as any });
                    }}
                    className="size-4 rounded border-border"
                  />
                  <code>{eventType}</code>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wh-enabled"
              checked={!!webhookDraft.enabled}
              onChange={(e) => setWebhookDraft({ ...webhookDraft, enabled: e.target.checked })}
              className="size-4 rounded border-border"
            />
            <Label htmlFor="wh-enabled" className="cursor-pointer">Enable this webhook</Label>
          </div>
        </div>
      </SidePanel>
    </div>
  );
}


export function EnvironmentsSecretsSettingsPage() {
  const queryClient = useQueryClient();
  const { showNotice, confirm } = useFeedback();
  const { data } = useQuery({
    queryKey: ["settings", "environmentsSecrets", "env"],
    queryFn: () => client.system.settings.env(),
  });
  const [variables, setVariables] = useState<EnvironmentEditorState["variables"]>([]);
  const [rawDraft, setRawDraft] = useState("");
  const [rawOpen, setRawOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [revealedNames, setRevealedNames] = useState<Record<string, boolean>>({});
  const envState = data;

  useEffect(() => {
    if (data) {
      setVariables(data.variables);
      setRawDraft(data.raw);
    }
  }, [data]);

  const saveRawMutation = useMutation({
    mutationFn: (raw: string) => client.system.settings.saveEnvRaw(raw),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "environmentsSecrets", "env"] });
      setVariables(next.variables);
      setRawDraft(next.raw);
      setRawOpen(false);
      showNotice({
        title: "Environment updated",
        description: "The .env file was saved. Restart the API if a runtime dependency does not refresh automatically.",
        variant: "success",
        durationMs: 5000,
      });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to save environment",
        description: getErrorMessage(error, "Could not save the .env file."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const openCreateVariable = () => {
    setEditingName(null);
    setNameDraft("");
    setValueDraft("");
    setEditorOpen(true);
  };

  const openEditVariable = (entry: EnvironmentEditorState["variables"][number]) => {
    setEditingName(entry.name);
    setNameDraft(entry.name);
    setValueDraft(entry.value);
    setEditorOpen(true);
  };

  const saveVariable = () => {
    const name = nameDraft.trim();
    if (!name) {
      showNotice({
        title: "Variable name required",
        description: "Enter an environment variable name before saving.",
        variant: "destructive",
        durationMs: 5000,
      });
      return;
    }

    const nextVariables = variables.filter((entry) => entry.name !== editingName && entry.name !== name);
    nextVariables.push({ name, value: valueDraft });
    nextVariables.sort((left, right) => left.name.localeCompare(right.name));
    const nextRaw = buildEnvRaw(nextVariables);
    saveRawMutation.mutate(nextRaw);
    setEditorOpen(false);
  };

  const deleteVariable = async (name: string) => {
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      description: "This removes the variable from the .env file.",
      confirmLabel: "Delete variable",
      cancelLabel: "Keep variable",
      variant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const nextVariables = variables.filter((entry) => entry.name !== name);
    saveRawMutation.mutate(buildEnvRaw(nextVariables));
  };

  const toggleReveal = (name: string) => {
    setRevealedNames((previous) => ({
      ...previous,
      [name]: !previous[name],
    }));
  };

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    showNotice({
      title: "Value copied",
      description: "The environment variable value was copied to the clipboard.",
      variant: "success",
      durationMs: 3000,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Environments & Secrets"
        description="Project .env variables with raw edit mode, row editing, and required-key diagnostics."
        actions={
          <>
            <Button variant="outline" onClick={() => setRawOpen(true)}>
              <Code2 className="mr-2 h-4 w-4" />
              Raw editor
            </Button>
            <Button onClick={openCreateVariable}>
              <Plus className="mr-2 h-4 w-4" />
              Add variable
            </Button>
          </>
        }
      />

      <CollapsiblePanel title="Environment variables" description="Project .env values, required-key health, and per-variable actions.">
        <div className="divide-y divide-border/50">
          <div className="grid gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>File: {data?.filePath ?? ".env"}</span>
              <Badge variant={(envState?.missingKeys.length ?? 0) > 0 ? "destructive" : "secondary"}>
                {(envState?.missingKeys.length ?? 0) > 0 ? `${envState?.missingKeys.length} missing required` : "All required present"}
              </Badge>
              {envState?.restartRequired ? <Badge variant="secondary">Restart may be required</Badge> : null}
            </div>
            {(envState?.requiredKeys.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-2">
                {envState?.requiredKeys.map((key) => (
                  <span
                    key={key}
                    className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] ${
                      envState?.missingKeys.includes(key)
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border/60 bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {key}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {(variables ?? []).length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No environment variables found in the project .env file.</div>
          ) : (
            variables.map((entry) => {
              const revealed = revealedNames[entry.name] === true;
              return (
                <div key={entry.name} className="grid gap-3 py-3 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                  <div className="font-mono text-sm text-foreground">{entry.name}</div>
                  <div className="group flex items-center gap-2 overflow-hidden">
                    <div className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-sm text-muted-foreground">
                      {revealed ? entry.value || " " : "•".repeat(Math.max(8, Math.min(24, entry.value.length || 8)))}
                    </div>
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                      <Button variant="outline" size="sm" onClick={() => toggleReveal(entry.name)}>
                        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void copyValue(entry.value)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditVariable(entry)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void deleteVariable(entry.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CollapsiblePanel>

      <SidePanel
        isOpen={rawOpen}
        onClose={() => setRawOpen(false)}
        title="Raw .env Editor"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRawOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveRawMutation.mutate(rawDraft)} disabled={saveRawMutation.isPending}>
              Save raw
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Edit the entire project .env file directly. Invalid dotenv syntax will be rejected.</p>
          <Textarea className="min-h-[420px] resize-y font-mono text-xs" value={rawDraft} onChange={(event) => setRawDraft(event.target.value)} />
        </div>
      </SidePanel>

      <SidePanel
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingName ? `Edit ${editingName}` : "Add Variable"}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveVariable} disabled={saveRawMutation.isPending}>
              Save variable
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Name</Label>
            <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="MY_ENV_KEY" className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-medium">Value</Label>
            <Textarea value={valueDraft} onChange={(event) => setValueDraft(event.target.value)} className="min-h-[180px] resize-y font-mono text-xs" />
          </div>
        </div>
      </SidePanel>
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
          title="Backup settings"
          description="pg_dump and retention defaults for backup creation."
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

      <CollapsiblePanel title="Recent runs" description="Latest backup executions, artifacts, and failures." defaultCollapsed>
        {(response?.runs ?? []).length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">No backup runs recorded yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {(response?.runs ?? []).map((run) => (
              <div key={run.id} className="grid gap-2 py-3 text-sm md:grid-cols-[auto_1fr_auto] md:items-start md:gap-4">
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
                <div className="text-sm text-muted-foreground">{run.sizeBytes != null ? `${run.sizeBytes.toLocaleString()} bytes` : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </CollapsiblePanel>
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
          title="Scheduler settings"
          description="Global scheduler cadence, concurrency, and timeout defaults."
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

      <CollapsiblePanel title="Jobs" description="Configured cron jobs with run, edit, and delete actions.">
        {(response?.jobs ?? []).length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">No cron jobs configured yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {(response?.jobs ?? []).map((job) => (
              <div key={job.id} className="grid gap-3 py-3 lg:grid-cols-[1.3fr_1fr_auto]">
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
      </CollapsiblePanel>

      <CollapsiblePanel title="Recent runs" description="Recent cron executions across all configured jobs." defaultCollapsed>
        {(response?.runs ?? []).length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">No cron runs recorded yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {(response?.runs ?? []).map((run) => (
              <div key={run.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_auto] md:items-start md:gap-4">
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
      </CollapsiblePanel>

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
