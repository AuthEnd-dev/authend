import { useQuery } from '@tanstack/react-query';
import { Radio, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { client } from '../lib/client';

export function RealtimeDiagnosticsPage() {
  const statsQuery = useQuery({
    queryKey: ['realtime-stats'],
    queryFn: () => client.system.realtime.stats(),
    refetchInterval: 4000,
  });

  const stats = statsQuery.data;

  return (
    <div className="flex-1 overflow-auto">
      <div className="w-full max-w-[900px] px-4 py-4 md:px-6 md:py-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              Realtime
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              App clients connect with the same session or API key as <span className="font-mono text-xs">/api/data</span>,
              then subscribe over WebSocket at <span className="font-mono text-xs">/api/realtime</span>. Events respect
              list/get policies and field visibility.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()} disabled={statsQuery.isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {statsQuery.isError ? (
          <p className="text-sm text-destructive">Could not load realtime stats.</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Connections</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{stats?.connections ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Subscriptions</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{stats?.subscriptions ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Events sent (process lifetime)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{stats?.eventsSentTotal ?? '—'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium text-foreground">Subscriptions by table</h3>
            <p className="text-xs text-muted-foreground">Count of active subscription entries per API table key.</p>
          </div>
          <div className="divide-y divide-border">
            {stats && Object.keys(stats.byTable).length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No active subscriptions.</p>
            ) : null}
            {stats
              ? Object.entries(stats.byTable)
                  .sort((a, b) => b[1] - a[1])
                  .map(([table, count]) => (
                    <div key={table} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="font-mono text-xs">{table}</span>
                      <span className="tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  ))
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}
