import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, startTransition, useCallback, type PointerEvent } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import type { AuditLog } from "@authend/shared";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Database,
  RotateCw,
  ScrollText,
  Search,
} from "lucide-react";
import { client } from "../lib/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { SidePanel } from "../components/ui/side-panel";
import { cn } from "../lib/utils";

type Severity = "info" | "warn" | "error";

function deriveSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (/error|fail|denied|failed/.test(a)) return "error";
  if (/warn/.test(a)) return "warn";
  return "info";
}

function formatCreatedFull(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    timeZoneName: "short",
  }).format(date);
}

function formatChartAxis(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatBucketRange(tStart: number, tEnd: number) {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  const a = new Intl.DateTimeFormat(undefined, opts).format(new Date(tStart));
  const b = new Intl.DateTimeFormat(undefined, opts).format(new Date(tEnd));
  return `${a} → ${b}`;
}

function payloadKeyCount(payload: Record<string, unknown>) {
  return Object.keys(payload ?? {}).length;
}

function LogFrequencyChart({ logs }: { logs: AuditLog[] }) {
  const series = useMemo(() => {
    if (logs.length === 0) {
      return { points: "", max: 0, tMin: 0, tMax: 0, n: 0, counts: [] as number[] };
    }
    const times = logs.map((l) => new Date(l.createdAt).getTime()).filter((t) => !Number.isNaN(t));
    if (times.length === 0) {
      return { points: "", max: 0, tMin: 0, tMax: 0, n: 0, counts: [] as number[] };
    }
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const span = Math.max(tMax - tMin, 1);
    const n = 36;
    const counts = new Array(n).fill(0);
    for (const t of times) {
      const i = Math.min(n - 1, Math.floor(((t - tMin) / span) * n));
      counts[i]++;
    }
    const max = Math.max(...counts, 1);
    const denom = Math.max(n - 1, 1);
    const pts = counts
      .map((c, i) => {
        const x = (i / denom) * 100;
        const y = 30 - (c / max) * 26;
        return `${x},${y}`;
      })
      .join(" ");
    return { points: pts, max, tMin, tMax, n, counts };
  }, [logs]);

  const [tooltip, setTooltip] = useState<{
    bucket: number;
    leftPct: number;
    topPx: number;
  } | null>(null);

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const onChartPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (series.n === 0 || series.counts.length === 0) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const bucket = Math.min(series.n - 1, Math.max(0, Math.floor(x * series.n)));
      const leftPct = ((bucket + 0.5) / series.n) * 100;
      const topPx = event.clientY - rect.top;
      setTooltip({ bucket, leftPct, topPx });
    },
    [series.n, series.counts.length],
  );

  if (logs.length === 0 || !series.points) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-border/40 bg-muted/10 text-xs text-muted-foreground">
        No data for chart
      </div>
    );
  }

  const span = Math.max(series.tMax - series.tMin, 1);
  const bucketStart = (i: number) => series.tMin + (i / series.n) * span;
  const bucketEnd = (i: number) => series.tMin + ((i + 1) / series.n) * span;
  const hoverCount = tooltip != null ? series.counts[tooltip.bucket] ?? 0 : 0;
  const hoverRange =
    tooltip != null ? formatBucketRange(bucketStart(tooltip.bucket), bucketEnd(tooltip.bucket)) : "";

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block h-0.5 w-8 rounded-full bg-destructive" aria-hidden />
          <span>Log entries per time bucket</span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          max <span className="text-foreground">{series.max}</span> / bucket
        </div>
      </div>

      <div
        className="relative"
        onPointerEnter={onChartPointer}
        onPointerMove={onChartPointer}
        onPointerLeave={clearTooltip}
        onPointerCancel={clearTooltip}
      >
        <svg viewBox="0 0 100 32" className="h-24 w-full cursor-crosshair text-destructive" preserveAspectRatio="none" aria-hidden>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1="0"
              x2="100"
              y1={8 + t * 20}
              y2={8 + t * 20}
              className="stroke-border/40"
              strokeWidth="0.15"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="0.45"
            vectorEffect="non-scaling-stroke"
            points={series.points}
          />
        </svg>

        {tooltip != null && (
          <div
            className="pointer-events-none absolute z-20 min-w-[140px] max-w-[min(100vw-2rem,280px)] rounded-md border border-border/60 bg-popover px-2.5 py-2 text-xs shadow-md"
            style={{
              left: `${tooltip.leftPct}%`,
              top: Math.max(4, tooltip.topPx),
              transform: "translate(-50%, calc(-100% - 6px))",
            }}
            role="tooltip"
          >
            <div className="font-semibold tabular-nums text-foreground">
              {hoverCount} {hoverCount === 1 ? "entry" : "entries"}
            </div>
            <div className="mt-0.5 font-mono text-[10px] leading-snug text-muted-foreground">{hoverRange}</div>
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
        <span>{formatChartAxis(series.tMin)}</span>
        <span>{formatChartAxis(series.tMax)}</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const dot =
    severity === "error"
      ? "bg-destructive"
      : severity === "warn"
        ? "bg-amber-500"
        : "bg-sky-500";
  const label = severity === "error" ? "ERROR" : severity === "warn" ? "WARN" : "INFO";
  const pill = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
    severity === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
    severity === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400",
    severity === "info" && "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-400",
  );
  return (
    <span className={pill}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}

type SeverityFilter = "all" | Severity;

const SEVERITY_FILTERS: { id: SeverityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "info", label: "INFO" },
  { id: "warn", label: "WARN" },
  { id: "error", label: "ERROR" },
];

export function AuditPage() {
  const { data, isFetching, isPending, refetch } = useQuery({
    queryKey: ["audit"],
    queryFn: () => client.system.auditLogs(),
  });

  const [searchValue, setSearchValue] = useState("");
  const [appliedSearchValue, setAppliedSearchValue] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [includeSystem, setIncludeSystem] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [detailEntry, setDetailEntry] = useState<AuditLog | null>(null);

  const filteredLogs = useMemo(() => {
    if (!data || data.length === 0) return [];
    let list = [...data];
    if (!includeSystem) {
      list = list.filter((e) => e.actorUserId != null && String(e.actorUserId).trim() !== "");
    }
    if (severityFilter !== "all") {
      list = list.filter((e) => deriveSeverity(e.action) === severityFilter);
    }
    const q = appliedSearchValue.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const hay = [e.action, e.target, e.actorUserId ?? "", JSON.stringify(e.payload ?? {})]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [data, includeSystem, severityFilter, appliedSearchValue]);

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center px-1">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded-sm border-muted-foreground/40 accent-primary"
              checked={table.getIsAllPageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center px-1">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded-sm border-muted-foreground/40 accent-primary"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "severity",
        accessorFn: (row) => deriveSeverity(row.action),
        header: "Level",
        enableSorting: true,
        cell: ({ row }) => <SeverityBadge severity={deriveSeverity(row.original.action)} />,
      },
      {
        id: "message",
        accessorFn: (row) => `${row.action} ${row.target}`,
        header: "Message",
        enableSorting: false,
        cell: ({ row }) => {
          const entry = row.original;
          const keys = payloadKeyCount(entry.payload ?? {});
          return (
            <div className="min-w-0 space-y-1.5">
              <div className="truncate font-medium text-foreground">
                <span className="font-mono text-[13px]">{entry.action}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-sm">{entry.target}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  actor: {entry.actorUserId ?? "system"}
                </span>
                <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  payloadKeys: {keys}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <button
            type="button"
            className="group flex w-full cursor-pointer items-center gap-2 text-left font-semibold transition-colors hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span className="truncate">Created</span>
            {column.getIsSorted() === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : column.getIsSorted() === "desc" ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
            )}
          </button>
        ),
        sortingFn: (rowA, rowB) => {
          const a = new Date(rowA.original.createdAt).getTime();
          const b = new Date(rowB.original.createdAt).getTime();
          return a - b;
        },
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">{formatCreatedFull(row.original.createdAt)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end pr-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setDetailEntry(row.original);
              }}
              aria-label="Open details"
            >
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredLogs,
    columns,
    state: { sorting, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  if (isPending) {
    return (
      <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 bg-card px-6 text-sm text-muted-foreground">
        <RotateCw className="h-6 w-6 animate-spin opacity-50" />
        Loading audit logs…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-4 px-6 pt-6">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground/90">
          <span className="text-lg font-medium tracking-normal text-muted-foreground/60">Logs</span>
          <span className="translate-y-px font-light text-muted-foreground/40">/</span>
          <span>Audit</span>
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
              checked={includeSystem}
              onChange={(e) => setIncludeSystem(e.target.checked)}
            />
            Include system entries
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-muted/60"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin opacity-50" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border/50">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/40 bg-background/50 px-3 shadow-sm focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  startTransition(() => setAppliedSearchValue(searchValue.trim()));
                }
              }}
              placeholder="Search action, target, actor, or payload…"
              className="h-8 w-full border-0 bg-transparent px-2.5 text-[13px] text-muted-foreground shadow-none placeholder:opacity-50 focus-visible:ring-0"
            />
            {searchValue.trim() !== "" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => startTransition(() => setAppliedSearchValue(searchValue.trim()))}
                >
                  Search
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setSearchValue("");
                    startTransition(() => setAppliedSearchValue(""));
                  }}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            Found {filteredLogs.length} logs
          </span>
        </div>

        <div className="shrink-0 space-y-2 border-b border-border/50 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {SEVERITY_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSeverityFilter(id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                  severityFilter === id
                    ? "border-border bg-secondary text-foreground shadow-sm"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <LogFrequencyChart logs={filteredLogs} />
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto custom-scrollbar">
          <Table className="relative min-w-[600px] w-full">
            <TableHeader className="group sticky top-0 z-20 border-border bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-border/50 hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const isSelect = header.column.id === "select";
                    const isActions = header.column.id === "actions";
                    return (
                      <TableHead
                        key={header.id}
                        className={`select-none whitespace-nowrap bg-background/95 px-4 align-middle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80 h-11 ${isSelect ? "sticky left-0 z-30 w-12 border-r border-border/30 bg-background shadow-[1px_0_0_0_hsl(var(--border)_/_0.3)]" : isActions ? "sticky right-0 z-30 w-12 border-l border-border/30 bg-background" : ""}`}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="group cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30"
                    onClick={() => setDetailEntry(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isSelect = cell.column.id === "select";
                      const isActions = cell.column.id === "actions";
                      const isMessage = cell.column.id === "message";
                      return (
                        <TableCell
                          key={cell.id}
                          className={
                            isSelect
                              ? "group-hover:bg-muted/50 sticky left-0 z-10 h-12 max-w-[300px] border-r border-border/30 bg-card px-4 py-2 shadow-[1px_0_0_0_hsl(var(--border)_/_0.3)] transition-colors"
                              : isActions
                                ? "group-hover:bg-muted/50 sticky right-0 z-10 h-12 max-w-[300px] border-l border-border/30 bg-card px-4 py-2 transition-colors"
                                : isMessage
                                  ? "max-w-[min(480px,45vw)] whitespace-normal px-4 py-2 align-top text-sm"
                                  : "h-12 max-w-[300px] truncate whitespace-nowrap px-4 py-2 text-sm"
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2 opacity-60">
                      {data && data.length > 0 ? (
                        <>
                          <ScrollText className="mb-2 h-8 w-8" strokeWidth={1.5} />
                          <p className="text-sm">No logs match your filters.</p>
                        </>
                      ) : (
                        <>
                          <Database className="mb-2 h-8 w-8" strokeWidth={1.5} />
                          <p className="text-sm">No log entries found.</p>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {table.getRowModel().rows.length > 0 && (
          <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between border-t border-border/50 bg-background p-2.5 px-6 text-[11px] font-medium text-muted-foreground shadow-[0_-1px_3px_auto_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-4">
              <span>{table.getSelectedRowModel().rows.length} selected row(s)</span>
              <div className="h-3 w-px bg-border" />
              <span>{filteredLogs.length} records total</span>
            </div>
            <span className="hidden font-mono uppercase tracking-widest opacity-50 sm:inline-block">Authend</span>
          </div>
        )}
      </div>

      <SidePanel
        isOpen={detailEntry != null}
        onClose={() => setDetailEntry(null)}
        title="Log entry"
      >
        {detailEntry && (
          <div className="space-y-5 text-sm">
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Action</div>
              <div className="font-mono text-base text-foreground">{detailEntry.action}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target</div>
              <div className="text-foreground">{detailEntry.target}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity={deriveSeverity(detailEntry.action)} />
              <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                id: {detailEntry.id}
              </span>
              <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                actor: {detailEntry.actorUserId ?? "system"}
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Created</div>
              <div className="font-mono text-xs text-muted-foreground">{formatCreatedFull(detailEntry.createdAt)}</div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payload</div>
              <pre className="max-h-[50vh] overflow-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                <code>{JSON.stringify(detailEntry.payload ?? {}, null, 2)}</code>
              </pre>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
