import { useQuery } from '@tanstack/react-query';
import { Braces, Code2, Eye, Lock, Route, SlidersHorizontal } from 'lucide-react';
import { client } from '../lib/client';
import { Button } from './ui/button';
import { SidePanel } from './ui/side-panel';
import { CodeBlock } from './ui/code-block';

export function ApiPreviewPanel({ tableName, isOpen, onClose }: { tableName: string; isOpen: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['api-preview', tableName],
    queryFn: () => client.system.api.preview(tableName),
    enabled: isOpen,
  });

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={`API Preview - ${tableName}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Read-only preview for runtime, OpenAPI, and SDK clients</div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8 pb-8">
        {isLoading && <div className="text-sm text-muted-foreground">Loading API preview...</div>}

        {data && (
          <>
            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Route className="h-4 w-4 text-muted-foreground" />
                Contract Summary
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                Edit route and policy settings from the table editor under <span className="font-semibold text-foreground">API Rules</span>.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Route Base</label>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">{data.resource.routeBase}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SDK Resource</label>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">{data.resource.config.sdkName}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tag</label>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">{data.resource.config.tag}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">{data.resource.config.description}</div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Access Policy
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">{data.resource.security.description}</div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Query Capabilities
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  Filtering: {data.resource.query.filtering.enabled ? data.resource.query.filtering.fields.join(', ') || 'all fields' : 'disabled'}
                </div>
                <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  Sorting: {data.resource.query.sorting.enabled ? data.resource.query.sorting.fields.join(', ') || 'all fields' : 'disabled'}
                </div>
                <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  Default sort: {data.resource.query.sorting.defaultField} {data.resource.query.sorting.defaultOrder}
                </div>
                <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  Includes: {data.resource.query.includes.enabled ? data.resource.query.includes.fields.join(', ') || 'none configured' : 'disabled'}
                </div>
              </div>
            </section>

            <section className="grid gap-3 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Operation Matrix
              </div>
              {data.resource.operations.map((operation) => (
                <div
                  key={operation.operationId}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {operation.method}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{operation.summary}</span>
                    </div>
                    <div className="mt-1 font-mono text-sm text-muted-foreground">{operation.path}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground/70">operationId: {operation.operationId}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${operation.enabled ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                    {operation.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                Client SDK Snippet
              </div>
              <CodeBlock code={data.snippets.sdk} language="ts" />
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Braces className="h-4 w-4 text-muted-foreground" />
                Fetch Snippet
              </div>
              <CodeBlock code={data.snippets.fetch} language="js" />
            </section>
          </>
        )}
      </div>
    </SidePanel>
  );
}
