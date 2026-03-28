import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BackupSettingsResponse } from "@authend/shared";
import { AlertTriangle, ChevronDown, ChevronRight, DatabaseBackup, ShieldAlert } from "lucide-react";
import { client } from "../lib/client";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { CodeBlock } from "../components/ui/code-block";
import { getErrorMessage, useFeedback } from "../components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { analyzeMigrationSafety, deriveMigrationBackupReadiness } from "../lib/migration-safety";
import { cn } from "../lib/utils";

function CollapsibleSection({
  title,
  description,
  children,
  defaultCollapsed = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-background">
      <button type="button" onClick={() => setCollapsed((current) => !current)} className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left md:px-5">
        {collapsed ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </button>
      {!collapsed ? children : null}
    </section>
  );
}

function SectionMetrics({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: "default" | "secondary" | "destructive" }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <div key={item.label} className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">{item.label}</span>
          <Badge variant={item.tone ?? "secondary"}>{item.value}</Badge>
        </div>
      ))}
    </div>
  );
}

export function MigrationsPage() {
  const queryClient = useQueryClient();
  const { confirm, showNotice } = useFeedback();
  const [sqlReviewed, setSqlReviewed] = useState(false);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [rollbackAcknowledged, setRollbackAcknowledged] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ["migrations"],
    queryFn: () => client.system.migrations(),
  });

  const backupsQuery = useQuery({
    queryKey: ["settings", "backups"],
    queryFn: async () => (await client.system.settings.get("backups")) as BackupSettingsResponse,
  });

  const previewMutation = useMutation({
    mutationFn: () => client.system.previewMigrations(),
    onSuccess: () => {
      setSqlReviewed(false);
      setBackupAcknowledged(false);
      setRollbackAcknowledged(false);
    },
    onError: (error) => {
      showNotice({
        title: "Preview failed",
        description: getErrorMessage(error, "Pending migrations could not be previewed."),
        variant: "destructive",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => client.system.applyMigrations(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["migrations"] });
      previewMutation.reset();
      setSqlReviewed(false);
      setBackupAcknowledged(false);
      setRollbackAcknowledged(false);
      showNotice({
        title: "Migrations applied",
        description: "Pending migrations were recorded and executed successfully.",
        variant: "success",
      });
    },
    onError: (error) => {
      showNotice({
        title: "Apply failed",
        description: getErrorMessage(error, "Pending migrations could not be applied."),
        variant: "destructive",
      });
    },
  });

  const previewData = previewMutation.data ?? [];
  const appliedCount = useMemo(() => (data ?? []).filter((migration) => migration.status === "applied").length, [data]);
  const rolledBackCount = useMemo(() => (data ?? []).filter((migration) => migration.status === "rolled_back").length, [data]);
  const previewKey = useMemo(() => previewData.map((migration) => migration.key).join("|"), [previewData]);
  const backupReadiness = useMemo(
    () =>
      deriveMigrationBackupReadiness({
        enabled: backupsQuery.data?.config.enabled ?? false,
        destination: backupsQuery.data?.config.artifactStorage ?? "filesystem",
        runs: backupsQuery.data?.runs ?? [],
      }),
    [backupsQuery.data],
  );
  const review = useMemo(() => analyzeMigrationSafety(previewData, backupReadiness), [backupReadiness, previewData]);
  const applyBlocked =
    previewData.length === 0 ||
    !sqlReviewed ||
    (review.requiresBackupConfirmation && !backupAcknowledged) ||
    (review.requiresRollbackConfirmation && !rollbackAcknowledged);

  useEffect(() => {
    setSqlReviewed(false);
    setBackupAcknowledged(false);
    setRollbackAcknowledged(false);
  }, [previewKey]);

  async function handleApply() {
    if (previewData.length === 0) {
      showNotice({
        title: "Preview required",
        description: "Run preview first so you can review the exact SQL before applying migrations.",
        variant: "destructive",
      });
      return;
    }

    if (applyBlocked) {
      showNotice({
        title: "Review incomplete",
        description: "Complete the migration safety review before applying pending changes.",
        variant: "destructive",
      });
      return;
    }

    const approved = await confirm({
      title: review.level === "destructive" ? "Apply destructive migrations?" : "Apply pending migrations?",
      description:
        review.level === "destructive"
          ? "These changes include destructive SQL. Recovery means restoring a backup and reverting the migration source, not clicking undo."
          : "This will execute the pending SQL exactly as shown in the preview.",
      confirmLabel: "Apply migrations",
      cancelLabel: "Cancel",
      variant: review.level === "destructive" ? "destructive" : "default",
    });

    if (!approved) {
      return;
    }

    applyMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Migrations</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">Review migration history, inspect pending SQL, and apply changes from the same table-driven workflow.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
            Preview pending
          </Button>
          <Button onClick={() => void handleApply()} disabled={applyMutation.isPending || previewMutation.isPending}>
            Apply pending
          </Button>
        </div>
      </section>

      <SectionMetrics
        items={[
          { label: "History", value: `${data?.length ?? 0}` },
          { label: "Applied", value: `${appliedCount}`, tone: "default" },
          { label: "Rolled back", value: `${rolledBackCount}`, tone: rolledBackCount > 0 ? "destructive" : "secondary" },
          { label: "Pending", value: `${previewData.length}`, tone: previewData.length > 0 ? "default" : "secondary" },
          {
            label: "Risk",
            value: review.level,
            tone: review.level === "destructive" ? "destructive" : review.level === "warning" ? "default" : "secondary",
          },
          { label: "Refresh", value: isFetching ? "updating" : "idle", tone: isFetching ? "default" : "secondary" },
        ]}
      />

      <section
        className={cn(
          "rounded-2xl border p-4 md:p-5",
          review.level === "destructive"
            ? "border-destructive/40 bg-destructive/6"
            : review.level === "warning"
              ? "border-amber-500/30 bg-amber-500/6"
              : "border-border/60 bg-background",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {review.level === "destructive" ? (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              ) : review.level === "warning" ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              ) : (
                <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
              )}
              <h3 className="text-sm font-semibold text-foreground">Safety review</h3>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">{review.summary}</p>
          </div>
          <Badge variant={review.level === "destructive" ? "destructive" : "secondary"}>
            {review.level === "safe" ? "routine" : review.level}
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Backup readiness</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {backupReadiness.latestSuccessfulBackupAt
                      ? `Latest successful backup completed ${new Date(backupReadiness.latestSuccessfulBackupAt).toLocaleString()}.`
                      : "No successful backup recorded yet."}
                  </p>
                </div>
                <Badge variant={backupReadiness.latestSuccessfulBackupAt ? "secondary" : "destructive"}>
                  {backupReadiness.destination}
                </Badge>
              </div>
            </div>

            {review.concerns.length > 0 ? (
              <div className="space-y-3">
                {review.concerns.map((concern, index) => (
                  <div
                    key={`${concern.migrationKey}-${concern.title}-${index}`}
                    className={cn(
                      "rounded-xl border bg-background px-4 py-3",
                      concern.severity === "destructive" ? "border-destructive/30" : "border-amber-500/30",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{concern.title}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{concern.migrationKey}</p>
                        <p className="text-sm text-muted-foreground">{concern.detail}</p>
                      </div>
                      <Badge variant={concern.severity === "destructive" ? "destructive" : "secondary"}>
                        {concern.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
                No destructive SQL patterns were detected in the current preview. Still review the exact statements before apply.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="text-sm font-medium text-foreground">Rollback guidance</p>
              <div className="mt-3 space-y-2">
                {review.guidance.map((item, index) => (
                  <div key={`${item}-${index}`} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="text-sm font-medium text-foreground">Required before apply</p>
              <div className="mt-3 space-y-3">
                <label className="flex items-start gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={sqlReviewed}
                    onChange={(event) => setSqlReviewed(event.target.checked)}
                    disabled={previewData.length === 0}
                  />
                  <span>I reviewed the pending SQL and understand what will run.</span>
                </label>
                {review.requiresBackupConfirmation ? (
                  <label className="flex items-start gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={backupAcknowledged}
                      onChange={(event) => setBackupAcknowledged(event.target.checked)}
                      disabled={previewData.length === 0}
                    />
                    <span>
                      I understand the current backup state and will take or verify a backup before relying on rollback.
                    </span>
                  </label>
                ) : null}
                {review.requiresRollbackConfirmation ? (
                  <label className="flex items-start gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={rollbackAcknowledged}
                      onChange={(event) => setRollbackAcknowledged(event.target.checked)}
                      disabled={previewData.length === 0}
                    />
                    <span>I understand recovery is backup restore plus migration reversal, not a one-click undo.</span>
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CollapsibleSection title="Migration history" description="Recorded migration runs with status and applied timestamp.">
        <div className="relative min-h-0 overflow-auto">
          <Table className="relative min-w-[720px] w-full">
            <TableHeader className="group sticky top-0 z-20 border-border bg-background">
              <TableRow className="border-b border-border/50 hover:bg-transparent">
                <TableHead className="h-11 bg-background/95 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  Migration
                </TableHead>
                <TableHead className="h-11 bg-background/95 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  Status
                </TableHead>
                <TableHead className="h-11 bg-background/95 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  Applied
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length > 0 ? (
                data?.map((migration) => (
                  <TableRow key={migration.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                    <TableCell className="max-w-[420px] whitespace-normal px-4 py-3 align-top">
                      <div className="text-sm font-medium text-foreground">{migration.title}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{migration.key}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top">
                      <Badge variant={migration.status === "applied" ? "default" : migration.status === "rolled_back" ? "destructive" : "secondary"}>
                        {migration.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-top text-sm text-muted-foreground">{migration.appliedAt ?? "pending"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                    No migrations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Pending preview" description="Server-side preview of migrations that have not been recorded as applied yet.">
        <div className="relative min-h-0 overflow-auto border-b border-border/50">
          <Table className="relative min-w-[720px] w-full">
            <TableHeader className="group sticky top-0 z-20 border-border bg-background">
              <TableRow className="border-b border-border/50 hover:bg-transparent">
                <TableHead className="h-11 bg-background/95 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  Migration
                </TableHead>
                <TableHead className="h-11 bg-background/95 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  Key
                </TableHead>
                <TableHead className="h-11 bg-background/95 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  SQL size
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.length > 0 ? (
                previewData.map((migration) => (
                  <TableRow key={migration.key} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                    <TableCell className="max-w-[420px] whitespace-normal px-4 py-3 align-top text-sm font-medium text-foreground">{migration.title}</TableCell>
                    <TableCell className="px-4 py-3 align-top font-mono text-[11px] text-muted-foreground">{migration.key}</TableCell>
                    <TableCell className="px-4 py-3 text-right align-top text-sm text-muted-foreground">{migration.sql.length.toLocaleString()} chars</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                    {previewMutation.isPending ? "Loading pending migrations..." : "No pending migrations."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 px-4 py-4 md:px-5">
          {previewData.length > 0 ? (
            previewData.map((migration) => (
              <div key={`${migration.key}-sql`} className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{migration.title}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{migration.key}</p>
                  </div>
                  <Badge variant="secondary">pending SQL</Badge>
                </div>
                <CodeBlock code={migration.sql} language="sql" className={cn("max-h-[260px] overflow-auto px-3 py-3 text-xs")} />
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">Run preview to inspect SQL before applying pending migrations.</div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
