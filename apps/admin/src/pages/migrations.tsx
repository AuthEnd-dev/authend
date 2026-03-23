import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { client } from "../lib/client";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
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

  const { data, isFetching } = useQuery({
    queryKey: ["migrations"],
    queryFn: () => client.system.migrations(),
  });

  const previewMutation = useMutation({
    mutationFn: () => client.system.previewMigrations(),
  });

  const applyMutation = useMutation({
    mutationFn: () => client.system.applyMigrations(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["migrations"] });
      previewMutation.reset();
    },
  });

  const previewData = previewMutation.data ?? [];
  const appliedCount = useMemo(() => (data ?? []).filter((migration) => migration.status === "applied").length, [data]);
  const rolledBackCount = useMemo(() => (data ?? []).filter((migration) => migration.status === "rolled_back").length, [data]);

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
          <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
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
          { label: "Refresh", value: isFetching ? "updating" : "idle", tone: isFetching ? "default" : "secondary" },
        ]}
      />

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
                <pre className={cn("max-h-[260px] overflow-auto px-3 py-3 font-mono text-xs text-muted-foreground")}>{migration.sql}</pre>
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
