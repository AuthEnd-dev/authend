import { Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import type {
  BackupSettingsResponse,
  CronSettingsResponse,
  SettingsSectionState,
  StorageSettingsResponse,
  WebhooksSettingsResponse,
} from "@authend/shared";

type DiagnosticIssue = {
  severity: "warning" | "error";
  title: string;
  reason: string;
  fix: string;
};

function parseIssues(input: unknown): DiagnosticIssue[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  const issues = (input as Record<string, unknown>).issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues.flatMap((issue) => {
    if (!issue || typeof issue !== "object") {
      return [];
    }
    const record = issue as Record<string, unknown>;
    if (
      (record.severity !== "warning" && record.severity !== "error") ||
      typeof record.title !== "string" ||
      typeof record.reason !== "string" ||
      typeof record.fix !== "string"
    ) {
      return [];
    }

    return [
      {
        severity: record.severity,
        title: record.title,
        reason: record.reason,
        fix: record.fix,
      },
    ];
  });
}

export function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => client.system.setupStatus(),
  });
  const metricsQuery = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: () => client.system.metrics(),
    refetchInterval: 5000,
  });
  const diagnosticsQueries = useQueries({
    queries: [
      {
        queryKey: ["settings", "email"],
        queryFn: () => client.system.settings.get("email") as Promise<SettingsSectionState>,
      },
      {
        queryKey: ["settings", "storage"],
        queryFn: () => client.system.settings.get("storage") as Promise<StorageSettingsResponse>,
      },
      {
        queryKey: ["settings", "backups"],
        queryFn: () => client.system.settings.get("backups") as Promise<BackupSettingsResponse>,
      },
      {
        queryKey: ["settings", "crons"],
        queryFn: () => client.system.settings.get("crons") as Promise<CronSettingsResponse>,
      },
      {
        queryKey: ["settings", "webhooks"],
        queryFn: () => client.system.settings.get("webhooks") as Promise<WebhooksSettingsResponse>,
      },
    ],
  });

  const setupTasks = [
    {
      title: "Create the superadmin account",
      done: Boolean(data?.superAdminExists),
      href: "/admin-access",
      description: "Without a seeded superadmin, the admin surface is not operable.",
      fix: "Seed or restore the system admin account before handing the backend to anyone else.",
    },
    {
      title: "Clear pending migrations",
      done: (data?.migrationsPending ?? 0) === 0,
      href: "/migrations",
      description: "Pending migrations mean your runtime and database schema are out of sync.",
      fix: "Review and apply pending migrations so the runtime matches the live database.",
    },
  ];

  const diagnosticTasks = [
    {
      title: "Email delivery",
      href: "/email",
      issues: parseIssues(diagnosticsQueries[0].data?.diagnostics),
    },
    {
      title: "File storage",
      href: "/storage",
      issues: parseIssues(diagnosticsQueries[1].data?.diagnostics),
    },
    {
      title: "Backups",
      href: "/backups",
      issues: parseIssues(diagnosticsQueries[2].data?.diagnostics),
    },
    {
      title: "Cron jobs",
      href: "/crons",
      issues: parseIssues(diagnosticsQueries[3].data?.diagnostics),
    },
    {
      title: "Webhooks",
      href: "/webhooks",
      issues: [],
    },
  ];

  const backupFailures = (diagnosticsQueries[2].data?.runs ?? []).filter((run) => run.status === "failed").slice(0, 3);
  const cronFailures = (diagnosticsQueries[3].data?.runs ?? []).filter((run) => run.status === "failed").slice(0, 3);
  const webhookFailures = (diagnosticsQueries[4].data?.recentDeliveries ?? [])
    .filter((delivery) => delivery.status === "failed" || delivery.status === "dead")
    .slice(0, 3);
  const failedOperations = [
    ...backupFailures.map((run) => ({
      scope: "Backups",
      status: "failed",
      detail: run.error ?? run.filePath ?? run.destination,
      href: "/backups",
      startedAt: run.startedAt,
    })),
    ...cronFailures.map((run) => ({
      scope: `Cron: ${run.jobName}`,
      status: run.status,
      detail: run.error ?? `${run.trigger} run failed`,
      href: "/crons",
      startedAt: run.startedAt,
    })),
    ...webhookFailures.map((delivery) => ({
      scope: `Webhook: ${delivery.eventType}`,
      status: delivery.status,
      detail: delivery.error ?? `HTTP ${delivery.responseStatus ?? "unknown"}`,
      href: "/webhooks",
      startedAt: delivery.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 6);

  const blockingTasks = [
    ...setupTasks
      .filter((task) => !task.done)
      .map((task) => ({
        severity: "error" as const,
        title: task.title,
        href: task.href,
        reason: task.description,
        fix: task.fix,
      })),
    ...diagnosticTasks.flatMap((task) =>
      task.issues.map((issue) => ({
        severity: issue.severity,
        title: `${task.title}: ${issue.title}`,
        href: task.href,
        reason: issue.reason,
        fix: issue.fix,
      })),
    ),
  ];
  const readyCount = setupTasks.filter((task) => task.done).length + diagnosticTasks.filter((task) => task.issues.length === 0).length;
  const totalCount = setupTasks.length + diagnosticTasks.length;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 items-start pb-2">
        <Badge variant="secondary" className="px-3 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary transition-colors border-0">Single-project Bun BaaS</Badge>
        <h2 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Own the auth layer, keep the backend malleable.</h2>
        <p className="text-xl text-muted-foreground max-w-3xl leading-relaxed">
          AuthEnd wraps Better Auth, Drizzle, and Postgres behind an admin surface that can
          evolve your schema and plugin set without rebuilding your app backend from scratch.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">First-run guide</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Finish the minimum setup needed for a small app backend: access, schema safety, email, storage, backups, and jobs.
                </p>
              </div>
              <Badge variant={blockingTasks.length === 0 ? "secondary" : "destructive"}>
                {readyCount}/{totalCount} ready
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...setupTasks, ...diagnosticTasks.map((task) => ({ ...task, done: task.issues.length === 0, description: "", fix: "" }))].map((task) => (
              <div key={task.title} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-background px-4 py-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-2.5 w-2.5 rounded-full ${task.done ? "bg-emerald-500" : "bg-destructive"}`}
                    />
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                  </div>
                  {!task.done && "description" in task && task.description ? (
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  ) : null}
                  {!task.done && "issues" in task && task.issues.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {task.issues[0]?.reason}
                    </p>
                  ) : null}
                </div>
                <Link
                  to={task.href}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  {task.done ? "Review" : "Fix now"}
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">What still needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blockingTasks.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 text-sm text-foreground">
                The backend passes the minimum setup checks. You can move on to schema design, app-facing APIs, and client integration.
              </div>
            ) : (
              blockingTasks.slice(0, 6).map((task) => (
                <div
                  key={`${task.href}-${task.title}`}
                  className={`rounded-xl border px-4 py-3 text-sm ${task.severity === "error" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}
                >
                  <p className="font-semibold text-foreground">{task.title}</p>
                  <p className="mt-1 text-muted-foreground">{task.reason}</p>
                  <p className="mt-2 text-foreground">{task.fix}</p>
                  <Link to={task.href} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
                    Open the relevant settings
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Operational failures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {failedOperations.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 text-sm text-foreground">
                No recent failed backup runs, cron executions, or webhook deliveries.
              </div>
            ) : (
              failedOperations.map((failure) => (
                <div key={`${failure.scope}-${failure.startedAt}-${failure.detail}`} className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{failure.scope}</p>
                    <Badge variant="destructive">{failure.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{failure.detail}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{new Date(failure.startedAt).toLocaleString()}</p>
                    <Link to={failure.href} className="text-sm font-medium text-primary hover:underline">
                      Open
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Slow request visibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              AuthEnd now emits a dedicated <code className="font-mono text-xs">request.slow</code> log entry for API requests taking
              at least 1000ms, with request ID and actor context attached.
            </p>
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="font-semibold text-foreground">What to look for in logs</p>
              <p className="mt-2">
                Filter for <code className="font-mono text-xs">"message":"request.slow"</code> and use the shared
                <code className="mx-1 font-mono text-xs">requestId</code> to correlate the slow request with related warnings or failures.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="font-semibold text-foreground">Included context</p>
              <p className="mt-2">
                Each slow-request log includes method, path, duration, actor kind, actor subject, and session or API key identifiers when available.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Runtime metrics</h3>
          <p className="text-sm text-muted-foreground">
            Lightweight in-memory metrics for the main API flows. These reset when the API process restarts.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metricsQuery.data
            ? [
                {
                  key: "auth",
                  label: "Auth",
                  requests: metricsQuery.data.flows.auth.requestsTotal,
                  errors: metricsQuery.data.flows.auth.errorsTotal,
                  avg: metricsQuery.data.flows.auth.averageDurationMs,
                  max: metricsQuery.data.flows.auth.maxDurationMs,
                  extra: null,
                },
                {
                  key: "crud",
                  label: "CRUD",
                  requests: metricsQuery.data.flows.crud.requestsTotal,
                  errors: metricsQuery.data.flows.crud.errorsTotal,
                  avg: metricsQuery.data.flows.crud.averageDurationMs,
                  max: metricsQuery.data.flows.crud.maxDurationMs,
                  extra: null,
                },
                {
                  key: "storage",
                  label: "Storage",
                  requests: metricsQuery.data.flows.storage.requestsTotal,
                  errors: metricsQuery.data.flows.storage.errorsTotal,
                  avg: metricsQuery.data.flows.storage.averageDurationMs,
                  max: metricsQuery.data.flows.storage.maxDurationMs,
                  extra: null,
                },
                {
                  key: "realtime",
                  label: "Realtime",
                  requests: metricsQuery.data.flows.realtime.requestsTotal,
                  errors: metricsQuery.data.flows.realtime.errorsTotal,
                  avg: metricsQuery.data.flows.realtime.averageDurationMs,
                  max: metricsQuery.data.flows.realtime.maxDurationMs,
                  extra: `${metricsQuery.data.flows.realtime.connections} conn / ${metricsQuery.data.flows.realtime.subscriptions} subs / ${metricsQuery.data.flows.realtime.eventsSentTotal} events`,
                },
                {
                  key: "webhook",
                  label: "Webhooks",
                  requests: metricsQuery.data.flows.webhook.requestsTotal,
                  errors: metricsQuery.data.flows.webhook.errorsTotal,
                  avg: metricsQuery.data.flows.webhook.averageDurationMs,
                  max: metricsQuery.data.flows.webhook.maxDurationMs,
                  extra: `${metricsQuery.data.flows.webhook.dispatchesTotal} dispatched / ${metricsQuery.data.flows.webhook.deliveriesSucceeded} ok / ${metricsQuery.data.flows.webhook.deliveriesFailed} failed`,
                },
              ].map((metric) => (
                <Card key={metric.key} className="border-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{metric.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-semibold tabular-nums text-foreground">{metric.requests}</div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>{metric.errors} errors</p>
                      <p>{metric.avg}ms avg</p>
                      <p>{metric.max}ms max</p>
                      {metric.extra ? <p>{metric.extra}</p> : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            : Array.from({ length: 5 }).map((_, index) => (
                <Card key={index} className="border-border shadow-sm">
                  <CardContent className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
                    {metricsQuery.isError ? "Could not load metrics." : "Loading metrics..."}
                  </CardContent>
                </Card>
              ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.healthy ? "Ready" : "Needs attention"}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Enabled plugins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.enabledPlugins.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Pending migrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.migrationsPending ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Superadmin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.superAdminExists ? "Seeded" : "Missing"}</div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
